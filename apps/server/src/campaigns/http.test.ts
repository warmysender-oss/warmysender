import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  campaigns,
  databaseSchema,
  enrollments,
  loadConfig,
  mailboxes,
  messages,
  migrationsFolder,
  type AppDatabase,
  type Config,
} from "@warmysender/core";
import { createApp } from "../app.js";

const PASSWORD = "correct-horse";

describe("contacts and campaigns http", () => {
  let db: AppDatabase;
  let app: Express;
  let config: Config;
  let close: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const client = new PGlite();
    close = () => client.close();
    const pglite = drizzle(client, { schema: databaseSchema });
    await migrate(pglite, { migrationsFolder: migrationsFolder() });
    db = pglite as unknown as AppDatabase;
    config = loadConfig({
      DATABASE_URL: "postgres://warmysender:warmysender@localhost:5432/warmysender",
      ENCRYPTION_KEY: Buffer.alloc(32, 0x31).toString("base64"),
      SESSION_SECRET: "test-session-secret-at-least-32-chars",
      PUBLIC_URL: "http://localhost:3000",
      NODE_ENV: "test",
    });
    app = createApp({ db, config, serveWeb: false, webDist: "" });
  });

  afterAll(async () => {
    await close?.();
  });

  beforeEach(async () => {
    await db.execute(sql.raw(
      `truncate table messages, enrollments, campaign_audience_contacts, campaign_audience_lists,
        campaign_mailboxes, campaign_steps, campaigns, list_members, suppressions, contacts, lists,
        mailboxes, audit_log, api_keys, sessions, invites, users restart identity cascade`,
    ));
  });

  it("imports a CSV, skips duplicates and suppressed rows, then starts without sending", async () => {
    const agent = request.agent(app);
    const created = await agent.post("/api/auth/register").send({
      email: "ada@studio.test",
      password: PASSWORD,
      name: "Ada",
    });
    expect(created.status).toBe(201);

    await db.insert(mailboxes).values({ email: "ada@studio.test" });
    const [mailbox] = await db.select().from(mailboxes);
    expect(mailbox?.email).toBe("ada@studio.test");

    const list = await agent.post("/api/contacts/lists").send({ name: "Clinics" });
    expect(list.status).toBe(201);

    const imported = await agent.post("/api/contacts/import").send({
      csv: [
        "email,first_name,company,city",
        "jane@harbor-dental.test,Jane,Harbor Dental,Lisbon",
        "Jane@Harbor-Dental.test,Again,Harbor Dental,Lisbon",
        "not-an-email,Sam,Harbor,Lisbon",
        "sam@blocked.test,Sam,Blocked,Porto",
      ].join("\n"),
      hasHeader: true,
      listIds: [list.body.list.id],
      mapping: [
        { index: 0, field: "email" },
        { index: 1, field: "first_name" },
        { index: 2, field: "company" },
        { index: 3, field: "custom:city" },
      ],
    });
    expect(imported.status).toBe(201);
    expect(imported.body.summary).toBe(
      "2 imported / 2 skipped (1 duplicate, 1 invalid syntax, 0 suppressed)",
    );

    await agent.post("/api/contacts/suppressions").send({ kind: "domain", value: "blocked.test" });
    const second = await agent.post("/api/contacts/import").send({
      csv: "email\nsam@blocked.test\nbea@harbor-dental.test\n",
      hasHeader: true,
      listIds: [],
      mapping: [{ index: 0, field: "email" }],
    });
    expect(second.body.summary).toBe("1 imported / 1 skipped (0 duplicate, 0 invalid syntax, 1 suppressed)");

    const contacts = await agent.get("/api/contacts");
    const jane = contacts.body.contacts.find((row: { email: string }) => row.email === "jane@harbor-dental.test");
    expect(jane.listIds).toEqual([list.body.list.id]);
    expect(jane.suppressed).toBe(false);

    const campaign = await agent.post("/api/campaigns").send({ name: "Harbor intro" });
    expect(campaign.status).toBe(201);
    const campaignId = campaign.body.campaign.id as string;

    const step = await agent.post(`/api/campaigns/${campaignId}/steps`).send({
      subject: "Hi {{first_name|there}}",
      body: "We help {{company}} in {{city}}.\n{{unsubscribe_link}}",
      contentType: "text",
    });
    expect(step.status).toBe(201);

    await agent.put(`/api/campaigns/${campaignId}/mailboxes`).send({ mailboxIds: [mailbox?.id] });
    await agent.put(`/api/campaigns/${campaignId}/audience`).send({
      contactIds: [jane.id],
      listIds: [],
    });

    const preview = await agent.post(`/api/campaigns/${campaignId}/preview`).send({
      stepId: step.body.step.id,
      contactId: jane.id,
    });
    expect(preview.status).toBe(200);
    expect(preview.body.preview.subject).toBe("Hi Jane");
    expect(preview.body.preview.body).toContain("Harbor Dental");
    expect(preview.body.preview.body).toContain("Lisbon");
    expect(preview.body.preview.body).toContain("http://localhost:3000/u/preview");

    const check = await agent.post(`/api/campaigns/${campaignId}/launch-check`).send({});
    expect(check.body.issues.filter((issue: { blocking: boolean }) => issue.blocking)).toEqual([]);

    const started = await agent.post(`/api/campaigns/${campaignId}/start`).send({});
    expect(started.status).toBe(200);
    expect(started.body.enrollmentsCreated).toBe(1);

    const enrolled = await db.select().from(enrollments);
    expect(enrolled).toHaveLength(1);
    expect(enrolled[0]?.contactId).toBe(jane.id);
    expect(enrolled[0]?.currentStep).toBe(1);
    expect(enrolled[0]?.mailboxId).toBeNull();
    expect(enrolled[0]?.status).toBe("active");
    expect(await db.select().from(messages)).toEqual([]);
    const [saved] = await db.select().from(campaigns);
    expect(saved?.status).toBe("running");
    expect(saved?.launchedAt).toBeTruthy();

    const paused = await agent.post(`/api/campaigns/${campaignId}/pause`).send({});
    expect(paused.body.state).toBe("paused");
    const resumed = await agent.post(`/api/campaigns/${campaignId}/start`).send({});
    expect(resumed.body.enrollmentsCreated).toBe(0);
    expect(await db.select().from(enrollments)).toHaveLength(1);
  });
});
