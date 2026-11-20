import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  contacts,
  databaseSchema,
  enrollments,
  inboundMessages,
  loadConfig,
  messages,
  migrationsFolder,
  type AppDatabase,
  type Config,
} from "@warmysender/core";
import { createApp } from "../app.js";
import type { ReplyTransport } from "./send-reply.js";

const PASSWORD = "correct-horse";

describe("inbox and stats routes", () => {
  let db: AppDatabase;
  let app: Express;
  let config: Config;
  let close: (() => Promise<void>) | undefined;
  const sent: Array<{ to: string; inReplyTo: string; mailboxId: string }> = [];
  const transport: ReplyTransport = async ({ mailbox, draft }) => {
    sent.push({ to: draft.to, inReplyTo: draft.inReplyTo, mailboxId: mailbox.email });
    return { messageId: "<out-1@harbor-dental.test>" };
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
    app = createApp({ db, config, serveWeb: false, webDist: "", replyTransport: transport });
  });

  afterAll(async () => {
    await close?.();
  });

  beforeEach(async () => {
    sent.length = 0;
    await db.execute(
      sql.raw(
        "truncate table audit_log, api_keys, sessions, invites, users, reply_drafts, inbound_messages, messages, enrollments, campaign_steps, campaigns, suppressions, contacts, mailboxes restart identity cascade",
      ),
    );
  });

  async function signIn() {
    const agent = request.agent(app);
    const created = await agent.post("/api/auth/register").send({
      email: "ada@harbor-dental.test",
      password: PASSWORD,
      name: "Ada",
    });
    expect(created.status).toBe(201);
    return agent;
  }

  it("lists a reply, marks interest, and sends the follow-up from the same mailbox", async () => {
    const agent = await signIn();
    const [mailbox] = await db
      .insert(databaseSchema.mailboxes)
      .values({ email: "alex@harbor-dental.test" })
      .returning();
    const [contact] = await db.insert(contacts).values({ email: "jane@river-clinic.test" }).returning();
    const [campaign] = await db.insert(databaseSchema.campaigns).values({ name: "Intro" }).returning();
    const [step] = await db
      .insert(databaseSchema.campaignSteps)
      .values({ campaignId: campaign!.id, position: 1, subject: "Intro", body: "Hello" })
      .returning();
    const [enrollment] = await db
      .insert(enrollments)
      .values({ campaignId: campaign!.id, contactId: contact!.id, mailboxId: mailbox!.id })
      .returning();
    const [outbound] = await db
      .insert(messages)
      .values({
        enrollmentId: enrollment!.id,
        campaignId: campaign!.id,
        stepId: step!.id,
        mailboxId: mailbox!.id,
        contactId: contact!.id,
        messageId: "<campaign-step1@harbor-dental.test>",
        subject: "Intro",
        bodyText: "Hello Jane",
        status: "sent",
        sentAt: new Date("2026-11-20T11:00:00.000Z"),
      })
      .returning();
    const [inbound] = await db
      .insert(inboundMessages)
      .values({
        mailboxId: mailbox!.id,
        imapUid: 4,
        fromEmail: "jane@river-clinic.test",
        subject: "Re: Intro",
        bodyText: "Thanks",
        kind: "reply",
        contactId: contact!.id,
        enrollmentId: enrollment!.id,
        matchedMessageId: outbound!.id,
        messageId: "<reply-1@river-clinic.test>",
        receivedAt: new Date("2026-11-20T13:00:00.000Z"),
      })
      .returning();

    const listed = await agent.get("/api/inbox");
    expect(listed.status).toBe(200);
    expect(listed.body.threads[0].badge).toBe("reply");
    expect(listed.body.threads[0].messages).toHaveLength(2);

    const interest = await agent.post(`/api/inbox/messages/${inbound!.id}/interest`).send({ interest: "interested" });
    expect(interest.status).toBe(200);

    const auto = await db
      .insert(inboundMessages)
      .values({
        mailboxId: mailbox!.id,
        imapUid: 5,
        fromEmail: "jane@river-clinic.test",
        subject: "Out of Office",
        bodyText: "Away",
        kind: "auto_reply",
        contactId: contact!.id,
        receivedAt: new Date("2026-11-20T13:05:00.000Z"),
      })
      .returning();
    const rejected = await agent
      .post(`/api/inbox/messages/${auto[0]!.id}/interest`)
      .send({ interest: "interested" });
    expect(rejected.status).toBe(400);

    const reply = await agent
      .post(`/api/inbox/threads/${mailbox!.id}/${contact!.id}/reply`)
      .send({ body: "Tuesday works." });
    expect(reply.status).toBe(201);
    expect(reply.body.inReplyTo).toBe("<reply-1@river-clinic.test>");
    expect(sent[0]).toEqual({
      to: "jane@river-clinic.test",
      inReplyTo: "<reply-1@river-clinic.test>",
      mailboxId: "alex@harbor-dental.test",
    });

    const stats = await agent.get("/api/stats");
    expect(stats.status).toBe(200);
    expect(stats.body.campaigns[0]).toMatchObject({ name: "Intro", sent: 1, replies: 1, replyRate: 1, stillInSequence: 1 });

    const setup = await agent.get("/api/setup");
    expect(setup.status).toBe(200);
    expect(setup.body).toMatchObject({
      mailboxCount: 1,
      dnsCheckedMailboxCount: 0,
      contactCount: 1,
      campaignCount: 1,
      demoCampaignAvailable: true,
    });
  });

  it("requires a sign-in", async () => {
    const response = await request(app).get("/api/inbox");
    expect(response.status).toBe(401);
  });
});
