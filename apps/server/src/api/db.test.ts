import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  databaseSchema,
  encryptString,
  loadConfig,
  contacts,
  mailboxes,
  messages,
  migrationsFolder,
  replyDrafts,
  type AppDatabase,
  type Config,
} from "@warmysender/core";
import { createApp } from "../app.js";
import { seedDemoIfEmpty } from "../seed/seed-demo.js";
import type { FetchLike } from "../warmysender/client.js";

const PASSWORD = "correct-horse";

const allowance = {
  can_verify_now: true,
  access_source: "plan",
  monthly_allowance: 100,
  monthly_used: 0,
  monthly_remaining: 100,
  daily_allowance: 10,
  daily_used: 0,
  daily_remaining: 10,
  daily_pace_note: "Released daily.",
  credit_balance: 0,
  addon_monthly_allowance: 0,
  addon_remaining: 0,
  free_checks_remaining_today: 0,
  can_buy_credits: true,
  verifiable_now: 10,
  max_addresses_per_batch: 100,
};

describe("agent API", () => {
  let db: AppDatabase;
  let app: Express;
  let config: Config;
  let close: (() => Promise<void>) | undefined;
  const warmyCalls: string[] = [];

  const warmyFetch: FetchLike = async (url) => {
    warmyCalls.push(new URL(url).pathname);
    const body = url.endsWith("/verification/allowance")
      ? JSON.stringify({ data: allowance, meta: { request_id: "req_test" } })
      : JSON.stringify({ error: { code: "unexpected", message: url } });
    const status = url.endsWith("/verification/allowance") ? 200 : 500;
    return { status, headers: { get: () => null }, text: async () => body };
  };

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
    app = createApp({ db, config, serveWeb: false, webDist: "", warmyFetch });
  });

  afterAll(async () => {
    await close?.();
  });

  beforeEach(async () => {
    warmyCalls.length = 0;
    await db.execute(
      sql.raw(
        "truncate table reply_drafts, inbound_messages, messages, enrollments, campaign_mailboxes, campaign_steps, campaigns, list_members, lists, suppressions, contacts, mailboxes, settings, audit_log, api_keys, sessions, invites, users cascade",
      ),
    );
  });

  it("rejects an API call without a key and refuses a limit field", async () => {
    const missing = await request(app).post("/api/v1/contacts").send({ email: "ada@harbor-dental.test" });
    expect(missing.status).toBe(401);

    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "ada@harbor-dental.test", password: PASSWORD, name: "Ada" });
    const created = await agent.post("/api/api-keys").send({ name: "Claude" });
    expect(created.status).toBe(201);
    const key = created.body.key as string;

    const limited = await request(app)
      .post("/api/v1/contacts")
      .set("authorization", `Bearer ${key}`)
      .send({ email: "jane@harbor-dental.test", daily_cap: 500 });
    expect(limited.status).toBe(403);
    expect(limited.body.error.code).toBe("limit_locked");

    const contact = await request(app)
      .post("/api/v1/contacts")
      .set("authorization", `Bearer ${key}`)
      .send({ email: "jane@harbor-dental.test", first_name: "Jane" });
    expect(contact.status).toBe(201);
    expect(contact.body.data.email).toBe("jane@harbor-dental.test");
  });

  it("starts a campaign without inserting a message", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "ada@harbor-dental.test", password: PASSWORD, name: "Ada" });
    const created = await agent.post("/api/api-keys").send({ name: "Claude" });
    const key = created.body.key as string;
    const auth = { authorization: `Bearer ${key}` };

    const contact = await request(app).post("/api/v1/contacts").set(auth).send({ email: "jane@harbor-dental.test" });
    const campaign = await request(app).post("/api/v1/campaigns").set(auth).send({ name: "Harbor intro" });
    const step = await request(app)
      .post(`/api/v1/campaigns/${campaign.body.data.id}/steps`)
      .set(auth)
      .send({ subject: "Hello", body: "Hi {{first_name|there}}\n\n{{unsubscribe_link}}", delay_days: 0 });
    expect(step.status).toBe(201);

    const [mailbox] = await db
      .insert(mailboxes)
      .values({ email: "ava@harbor-dental.test", fromName: "Ava", provider: "custom" })
      .returning();
    expect(mailbox).toBeTruthy();
    await request(app)
      .patch(`/api/v1/campaigns/${campaign.body.data.id}`)
      .set(auth)
      .send({ mailbox_ids: [mailbox!.id] });
    const enrolled = await request(app)
      .post(`/api/v1/campaigns/${campaign.body.data.id}/enrollments`)
      .set(auth)
      .send({ contact_ids: [contact.body.data.id] });
    expect(enrolled.body.data.enrolled).toBe(1);

    const started = await request(app).post(`/api/v1/campaigns/${campaign.body.data.id}/start`).set(auth).send({});
    expect(started.status).toBe(200);
    expect(started.body.data.started).toBe(true);

    const sent = await db.select().from(messages);
    expect(sent).toEqual([]);
  });

  it("saves a reply draft and does not mark it sent", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "ada@harbor-dental.test", password: PASSWORD, name: "Ada" });
    const created = await agent.post("/api/api-keys").send({ name: "Claude" });
    const key = created.body.key as string;

    const [mailbox] = await db
      .insert(mailboxes)
      .values({ email: "ava@harbor-dental.test", fromName: "Ava", provider: "custom" })
      .returning();
    const { inboundMessages } = await import("@warmysender/core");
    const [inbound] = await db
      .insert(inboundMessages)
      .values({
        mailboxId: mailbox!.id,
        imapUid: 1,
        fromEmail: "jane@harbor-dental.test",
        subject: "Re: Hello",
        bodyText: "Interested",
        kind: "reply",
        receivedAt: new Date(),
      })
      .returning();

    const draft = await request(app)
      .post(`/api/v1/replies/${inbound!.id}/draft`)
      .set("authorization", `Bearer ${key}`)
      .send({ body: "Thanks — a person will send this." });
    expect(draft.status).toBe(201);
    const rows = await db.select().from(replyDrafts).where(eq(replyDrafts.id, draft.body.data.id));
    expect(rows[0]?.status).toBe("draft");
    expect(rows[0]?.sentMessageId).toBeNull();
  });

  it("stores a WarmySender key only after a mocked allowance check and does not echo it", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "ada@harbor-dental.test", password: PASSWORD, name: "Ada" });

    const saved = await agent.put("/api/settings/warmysender").send({ api_key: "ws_test_only" });
    expect(saved.status).toBe(200);
    expect(saved.body.data.connected).toBe(true);
    expect(JSON.stringify(saved.body)).not.toContain("ws_test_only");
    expect(warmyCalls.some((path) => path.endsWith("/verification/allowance"))).toBe(true);

    const [mailbox] = await db
      .insert(mailboxes)
      .values({
        email: "ava@harbor-dental.test",
        fromName: "Ava",
        provider: "custom",
        smtpHost: "smtp.harbor-dental.test",
        smtpUsername: "ava@harbor-dental.test",
        smtpPasswordEncrypted: encryptString("demo-secret", config.encryptionKey),
        imapHost: "imap.harbor-dental.test",
        imapUsername: "ava@harbor-dental.test",
        imapPasswordEncrypted: encryptString("demo-secret", config.encryptionKey),
      })
      .returning();

    warmyCalls.length = 0;
    const unconfirmed = await agent.post(`/api/warmysender/mailboxes/${mailbox!.id}/warmup`).send({ confirmed: false });
    expect(unconfirmed.status).toBe(200);
    expect(unconfirmed.body.data.status).toBe("confirmation_required");
    expect(warmyCalls).toEqual([]);
  });

  it("seeds only .test demo contacts and does not insert them twice", async () => {
    const first = await seedDemoIfEmpty(db, config.encryptionKey);
    expect(first.inserted).toBe(true);
    const second = await seedDemoIfEmpty(db, config.encryptionKey);
    expect(second.inserted).toBe(false);
    const rows = await db.select().from(contacts);
    expect(rows.map((row) => row.email).sort()).toEqual([
      "jane@harbor-dental.test",
      "riley@lumen-labs.test",
      "sam@north-pier.test",
    ]);
    expect(rows.every((row) => row.email.endsWith(".test"))).toBe(true);
  });

  it("lists MCP tools that refuse to send or raise a limit", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "ada@harbor-dental.test", password: PASSWORD, name: "Ada" });
    const created = await agent.post("/api/api-keys").send({ name: "Claude" });
    const listed = await request(app)
      .post("/mcp")
      .set("authorization", `Bearer ${created.body.key}`)
      .set("accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(listed.status).toBe(200);
    const tools = listed.body.result.tools as { name: string; description: string }[];
    expect(tools.some((tool) => tool.name === "start_campaign")).toBe(true);
    expect(tools.some((tool) => tool.name === "send" || tool.name === "send_email")).toBe(false);
    expect(tools.every((tool) => tool.description.includes("never send directly and can never raise a limit"))).toBe(true);
  });
});
