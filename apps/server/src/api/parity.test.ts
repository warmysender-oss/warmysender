import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  campaigns,
  contacts,
  databaseSchema,
  enrollments,
  loadConfig,
  mailboxes,
  messages,
  migrationsFolder,
  suppressions,
  type AppDatabase,
  type Config,
} from "@warmysender/core";
import { createApp } from "../app.js";

const PASSWORD = "correct-horse";

const PEOPLE = [
  {
    email: "Jane@Harbor-Dental.test",
    first_name: "Jane",
    last_name: "Doe",
    company: "Harbor Dental",
    title: "Dentist",
    custom_fields: { city: "Lisbon" },
  },
  {
    email: "jane@harbor-dental.test",
    first_name: "Again",
    last_name: "Doe",
    company: "Harbor Dental",
    title: "Dentist",
    custom_fields: { city: "Lisbon" },
  },
  { email: "not-an-email", first_name: "Sam", last_name: "", company: "", title: "", custom_fields: {} },
  {
    email: "sam@blocked.test",
    first_name: "Sam",
    last_name: "Block",
    company: "Blocked",
    title: "Ops",
    custom_fields: { city: "Porto" },
  },
  {
    email: "bea@harbor-dental.test",
    first_name: "Bea",
    last_name: "Kay",
    company: "Harbor Dental",
    title: "Lead",
    custom_fields: { city: "Lisbon" },
  },
];

describe("app, REST, and MCP share one writer", () => {
  let db: AppDatabase;
  let app: Express;
  let close: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const client = new PGlite();
    close = () => client.close();
    const pglite = drizzle(client, { schema: databaseSchema });
    await migrate(pglite, { migrationsFolder: migrationsFolder() });
    db = pglite as unknown as AppDatabase;
    const config: Config = loadConfig({
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

  it("stores the same contacts for a CSV import and for REST and MCP bulk create", async () => {
    const { agent, auth } = await signIn(app);

    await agent.post("/api/contacts/suppressions").send({ kind: "domain", value: "blocked.test" });
    const imported = await agent.post("/api/contacts/import").send({
      csv: [
        "email,first_name,last_name,company,title,city",
        "Jane@Harbor-Dental.test,Jane,Doe,Harbor Dental,Dentist,Lisbon",
        "jane@harbor-dental.test,Again,Doe,Harbor Dental,Dentist,Lisbon",
        "not-an-email,Sam,,,,",
        "sam@blocked.test,Sam,Block,Blocked,Ops,Porto",
        "bea@harbor-dental.test,Bea,Kay,Harbor Dental,Lead,Lisbon",
      ].join("\n"),
      hasHeader: true,
      listIds: [],
      mapping: [
        { index: 0, field: "email" },
        { index: 1, field: "first_name" },
        { index: 2, field: "last_name" },
        { index: 3, field: "company" },
        { index: 4, field: "title" },
        { index: 5, field: "custom:city" },
      ],
    });
    expect(imported.status).toBe(201);
    expect(imported.body.summary).toBe(
      "2 imported / 3 skipped (1 duplicate, 1 invalid syntax, 1 suppressed)",
    );
    const fromApp = await contactRows(db);

    await clearContacts(db);
    await agent.post("/api/contacts/suppressions").send({ kind: "domain", value: "blocked.test" });
    const bulk = await request(app).post("/api/v1/contacts/bulk").set(auth).send({ contacts: PEOPLE });
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.skipped.map((row: { reason: string }) => row.reason).sort()).toEqual([
      "duplicate",
      "invalid syntax",
      "suppressed",
    ]);
    expect(await contactRows(db)).toEqual(fromApp);

    await clearContacts(db);
    await agent.post("/api/contacts/suppressions").send({ kind: "domain", value: "blocked.test" });
    const mcp = await callTool(app, auth.authorization.replace("Bearer ", ""), "bulk_create_contacts", {
      contacts: PEOPLE,
    });
    expect(mcp.isError).toBe(false);
    expect(await contactRows(db)).toEqual(fromApp);
  });

  it("returns the same launch-check messages when a mailbox is paused", async () => {
    const { agent, auth } = await signIn(app);
    const appMessages = await pausedLaunchMessages(app, agent, db, "app");
    await clearCampaignData(db);

    const rest = await pausedLaunchMessages(app, agent, db, "rest", auth);
    expect(rest).toEqual(appMessages);
    await clearCampaignData(db);

    const mcp = await pausedLaunchMessages(app, agent, db, "mcp", auth);
    expect(mcp).toEqual(appMessages);
    expect(await db.select().from(enrollments)).toEqual([]);
    expect(await db.select().from(messages)).toEqual([]);
    const [campaign] = await db.select().from(campaigns);
    expect(campaign?.status).toBe("draft");
  });

  it("starts enrollments only for active contacts that are not suppressed", async () => {
    const { agent, auth } = await signIn(app);
    const fromApp = await startSequence(app, agent, db, "app");
    await clearCampaignData(db);

    const fromRest = await startSequence(app, agent, db, "rest", auth);
    expect(fromRest).toEqual(fromApp);
    await clearCampaignData(db);

    const fromMcp = await startSequence(app, agent, db, "mcp", auth);
    expect(fromMcp).toEqual(fromApp);
    expect(await db.select().from(messages)).toEqual([]);
  });
});

async function signIn(app: Express) {
  const agent = request.agent(app);
  const created = await agent
    .post("/api/auth/register")
    .send({ email: "ada@studio.test", password: PASSWORD, name: "Ada" });
  expect(created.status).toBe(201);
  const key = await agent.post("/api/api-keys").send({ name: "Claude" });
  expect(key.status).toBe(201);
  return { agent, auth: { authorization: `Bearer ${key.body.key as string}` } };
}

async function contactRows(db: AppDatabase) {
  const rows = await db.select().from(contacts);
  return rows
    .map((row) => ({
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      company: row.company,
      title: row.title,
      customFields: row.customFields,
      status: row.status,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

async function enrollmentRows(db: AppDatabase) {
  const rows = await db
    .select({
      email: contacts.email,
      status: enrollments.status,
      currentStep: enrollments.currentStep,
      mailboxId: enrollments.mailboxId,
      campaignStatus: campaigns.status,
    })
    .from(enrollments)
    .innerJoin(contacts, eq(enrollments.contactId, contacts.id))
    .innerJoin(campaigns, eq(enrollments.campaignId, campaigns.id));
  return rows.sort((a, b) => a.email.localeCompare(b.email));
}

async function clearContacts(db: AppDatabase) {
  await db.execute(sql.raw("truncate table list_members, contacts, suppressions restart identity cascade"));
}

async function clearCampaignData(db: AppDatabase) {
  await db.execute(sql.raw(
    `truncate table messages, enrollments, campaign_audience_contacts, campaign_audience_lists,
      campaign_mailboxes, campaign_steps, campaigns, list_members, suppressions, contacts, lists,
      mailboxes restart identity cascade`,
  ));
}

async function callTool(app: Express, key: string, name: string, args: unknown) {
  const response = await request(app)
    .post("/mcp")
    .set("authorization", `Bearer ${key}`)
    .set("accept", "application/json, text/event-stream")
    .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  expect(response.status).toBe(200);
  const text = response.body.result.content[0].text as string;
  return { isError: response.body.result.isError as boolean, body: JSON.parse(text) as { data: unknown } };
}

async function pausedLaunchMessages(
  app: Express,
  agent: request.Agent,
  db: AppDatabase,
  path: "app" | "rest" | "mcp",
  auth?: { authorization: string },
): Promise<string[]> {
  const [mailbox] = await db
    .insert(mailboxes)
    .values({
      email: "ava@harbor-dental.test",
      fromName: "Ava",
      provider: "custom",
      health: "paused",
      pausedReason: "Reconnect",
    })
    .returning();
  const step = {
    subject: "Hello",
    body: "Hi {{first_name|there}}\n\n{{unsubscribe_link}}",
    delay_days: 0,
  };

  if (path === "app") {
    const imported = await agent.post("/api/contacts/import").send({
      csv: "email,first_name\njane@harbor-dental.test,Jane\n",
      hasHeader: true,
      listIds: [],
      mapping: [
        { index: 0, field: "email" },
        { index: 1, field: "first_name" },
      ],
    });
    expect(imported.status).toBe(201);
    const listed = await agent.get("/api/contacts");
    const jane = listed.body.contacts.find((row: { email: string }) => row.email === "jane@harbor-dental.test");
    const campaign = await agent.post("/api/campaigns").send({ name: "Harbor intro" });
    const campaignId = campaign.body.campaign.id as string;
    await agent.post(`/api/campaigns/${campaignId}/steps`).send({
      subject: step.subject,
      body: step.body,
      delayDays: 0,
    });
    await agent.put(`/api/campaigns/${campaignId}/mailboxes`).send({ mailboxIds: [mailbox?.id] });
    await agent.put(`/api/campaigns/${campaignId}/audience`).send({ contactIds: [jane.id], listIds: [] });
    const check = await agent.post(`/api/campaigns/${campaignId}/launch-check`).send({});
    expect(check.status).toBe(200);
    return check.body.issues.map((issue: { message: string }) => issue.message);
  }

  const key = auth?.authorization.replace("Bearer ", "") ?? "";
  if (path === "rest") {
    const contact = await agent.post("/api/v1/contacts").set(auth!).send({ email: "jane@harbor-dental.test", first_name: "Jane" });
    const campaign = await agent.post("/api/v1/campaigns").set(auth!).send({ name: "Harbor intro" });
    const campaignId = campaign.body.data.id as string;
    await agent.post(`/api/v1/campaigns/${campaignId}/steps`).set(auth!).send(step);
    await agent.patch(`/api/v1/campaigns/${campaignId}`).set(auth!).send({ mailbox_ids: [mailbox?.id] });
    await agent.post(`/api/v1/campaigns/${campaignId}/enrollments`).set(auth!).send({ contact_ids: [contact.body.data.id] });
    const started = await agent.post(`/api/v1/campaigns/${campaignId}/start`).set(auth!).send({});
    expect(started.status).toBe(409);
    expect(started.body.data.started).toBe(false);
    return started.body.data.problems as string[];
  }

  const contact = await callTool(app, key, "create_contact", { email: "jane@harbor-dental.test", first_name: "Jane" });
  const campaign = await callTool(app, key, "create_campaign", { name: "Harbor intro" });
  const campaignId = (campaign.body.data as { id: string }).id;
  await callTool(app, key, "add_campaign_step", { id: campaignId, ...step });
  await callTool(app, key, "update_campaign", { id: campaignId, mailbox_ids: [mailbox?.id] });
  await callTool(app, key, "enroll", { id: campaignId, contact_ids: [(contact.body.data as { id: string }).id] });
  const started = await callTool(app, key, "start_campaign", { id: campaignId });
  expect(started.isError).toBe(true);
  const data = started.body.data as { started: boolean; problems: string[] };
  expect(data.started).toBe(false);
  return data.problems;
}

async function startSequence(
  app: Express,
  agent: request.Agent,
  db: AppDatabase,
  path: "app" | "rest" | "mcp",
  auth?: { authorization: string },
) {
  const [mailbox] = await db
    .insert(mailboxes)
    .values({ email: "ava@harbor-dental.test", fromName: "Ava", provider: "custom" })
    .returning();
  const emails = [
    "jane@harbor-dental.test",
    "sam@harbor-dental.test",
    "bea@harbor-dental.test",
    "riley@harbor-dental.test",
  ];

  if (path === "app") {
    const imported = await agent.post("/api/contacts/import").send({
      csv: ["email", ...emails].join("\n"),
      hasHeader: true,
      listIds: [],
      mapping: [{ index: 0, field: "email" }],
    });
    expect(imported.status).toBe(201);
    const listed = await agent.get("/api/contacts");
    const byEmail = new Map(listed.body.contacts.map((row: { id: string; email: string }) => [row.email, row.id]));
    await agent.patch(`/api/contacts/${byEmail.get("sam@harbor-dental.test")}`).send({ status: "replied" });
    await agent.patch(`/api/contacts/${byEmail.get("riley@harbor-dental.test")}`).send({ status: "unsubscribed" });
    await agent.post("/api/contacts/suppressions").send({ kind: "email", value: "bea@harbor-dental.test" });
    const campaign = await agent.post("/api/campaigns").send({ name: "Harbor intro" });
    const campaignId = campaign.body.campaign.id as string;
    await agent.post(`/api/campaigns/${campaignId}/steps`).send({
      subject: "Hello",
      body: "Hi {{first_name|there}}\n\n{{unsubscribe_link}}",
    });
    await agent.put(`/api/campaigns/${campaignId}/mailboxes`).send({ mailboxIds: [mailbox?.id] });
    await agent.put(`/api/campaigns/${campaignId}/audience`).send({
      contactIds: emails.map((email) => byEmail.get(email)),
      listIds: [],
    });
    const check = await agent.post(`/api/campaigns/${campaignId}/launch-check`).send({});
    expect(check.body.issues.filter((issue: { blocking: boolean }) => issue.blocking)).toEqual([]);
    const started = await agent.post(`/api/campaigns/${campaignId}/start`).send({});
    expect(started.status).toBe(200);
    expect(started.body.enrollmentsCreated).toBe(1);
    return { enrollments: await enrollmentRows(db), suppressions: await suppressionRows(db) };
  }

  const key = auth?.authorization.replace("Bearer ", "") ?? "";
  if (path === "rest") {
    for (const email of emails) {
      const created = await agent.post("/api/v1/contacts").set(auth!).send({ email });
      expect(created.status).toBe(201);
    }
    const listed = await agent.get("/api/v1/contacts").set(auth!);
    const byEmail = new Map(listed.body.data.map((row: { id: string; email: string }) => [row.email, row.id]));
    await agent.patch(`/api/v1/contacts/${byEmail.get("sam@harbor-dental.test")}`).set(auth!).send({ status: "replied" });
    await agent.patch(`/api/v1/contacts/${byEmail.get("riley@harbor-dental.test")}`).set(auth!).send({ status: "unsubscribed" });
    await agent.post("/api/contacts/suppressions").send({ kind: "email", value: "bea@harbor-dental.test" });
    const campaign = await agent.post("/api/v1/campaigns").set(auth!).send({ name: "Harbor intro" });
    const campaignId = campaign.body.data.id as string;
    await agent.post(`/api/v1/campaigns/${campaignId}/steps`).set(auth!).send({
      subject: "Hello",
      body: "Hi {{first_name|there}}\n\n{{unsubscribe_link}}",
      delay_days: 0,
    });
    await agent.patch(`/api/v1/campaigns/${campaignId}`).set(auth!).send({ mailbox_ids: [mailbox?.id] });
    const enrolled = await agent
      .post(`/api/v1/campaigns/${campaignId}/enrollments`)
      .set(auth!)
      .send({ contact_ids: emails.map((email) => byEmail.get(email)) });
    expect(enrolled.body.data.enrolled).toBe(1);
    const started = await agent.post(`/api/v1/campaigns/${campaignId}/start`).set(auth!).send({});
    expect(started.status).toBe(200);
    expect(started.body.data.started).toBe(true);
    return { enrollments: await enrollmentRows(db), suppressions: await suppressionRows(db) };
  }

  for (const email of emails) {
    await callTool(app, key, "create_contact", { email });
  }
  const listed = await callTool(app, key, "list_contacts", {});
  const byEmail = new Map(
    (listed.body.data as { id: string; email: string }[]).map((row) => [row.email, row.id]),
  );
  await callTool(app, key, "update_contact_status", { id: byEmail.get("sam@harbor-dental.test"), status: "replied" });
  await callTool(app, key, "update_contact_status", {
    id: byEmail.get("riley@harbor-dental.test"),
    status: "unsubscribed",
  });
  await agent.post("/api/contacts/suppressions").send({ kind: "email", value: "bea@harbor-dental.test" });
  const campaign = await callTool(app, key, "create_campaign", { name: "Harbor intro" });
  const campaignId = (campaign.body.data as { id: string }).id;
  await callTool(app, key, "add_campaign_step", {
    id: campaignId,
    subject: "Hello",
    body: "Hi {{first_name|there}}\n\n{{unsubscribe_link}}",
    delay_days: 0,
  });
  await callTool(app, key, "update_campaign", { id: campaignId, mailbox_ids: [mailbox?.id] });
  const enrolled = await callTool(app, key, "enroll", {
    id: campaignId,
    contact_ids: emails.map((email) => byEmail.get(email)),
  });
  expect((enrolled.body.data as { enrolled: number }).enrolled).toBe(1);
  const started = await callTool(app, key, "start_campaign", { id: campaignId });
  expect(started.isError).toBe(false);
  expect((started.body.data as { started: boolean }).started).toBe(true);
  return { enrollments: await enrollmentRows(db), suppressions: await suppressionRows(db) };
}

async function suppressionRows(db: AppDatabase) {
  const rows = await db.select().from(suppressions);
  return rows
    .map((row) => ({ kind: row.kind, value: row.value, reason: row.reason }))
    .sort((a, b) => a.value.localeCompare(b.value));
}
