import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  databaseSchema,
  decryptString,
  loadConfig,
  mailboxes,
  migrationsFolder,
  type AppDatabase,
  type Config,
  type DnsResolver,
} from "@warmysender/core";
import { createApp } from "../app.js";

const PASSWORD = "correct-horse";
const KEY = Buffer.alloc(32, 0x31).toString("base64");

const resolver: DnsResolver = {
  async resolveTxt() {
    return [];
  },
  async resolveMx() {
    return [];
  },
  async resolveCname() {
    return [];
  },
};

describe("mailbox http", () => {
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
      ENCRYPTION_KEY: KEY,
      SESSION_SECRET: "test-session-secret-at-least-32-chars",
      PUBLIC_URL: "http://localhost:3000",
      NODE_ENV: "test",
    });
    app = createApp({ db, config, serveWeb: false, webDist: "", mail: { resolver } });
  });

  afterAll(async () => {
    await close?.();
  });

  beforeEach(async () => {
    await db.execute(sql.raw("truncate table mailboxes, audit_log, api_keys, sessions, invites, users restart identity cascade"));
  });

  it("stores the password encrypted and refuses a cap above 50", async () => {
    const signedOut = await request(app).get("/api/mailboxes");
    expect(signedOut.status).toBe(401);
    expect(signedOut.body.error).toBe("Sign in first.");

    const agent = request.agent(app);
    const createdUser = await agent.post("/api/auth/register").send({
      email: "ada@harbor-dental.test",
      password: PASSWORD,
      name: "Ada",
    });
    expect(createdUser.status).toBe(201);

    const microsoft = await agent.get("/api/oauth/microsoft/availability");
    expect(microsoft.status).toBe(200);
    expect(microsoft.body.available).toBe(false);
    expect(microsoft.body.message).toContain("docs/MICROSOFT-APP.md");

    const tooHigh = await agent.post("/api/mailboxes").send(draft({ dailyCap: 51 }));
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.error).toContain("50");

    const created = await agent.post("/api/mailboxes").send(draft());
    expect(created.status).toBe(200);
    expect(created.body.mailbox.email).toBe("ada@harbor-dental.test");
    expect(created.body.mailbox.rampLabel).toBe("Day 1 of ramp: 10 a day");
    expect(JSON.stringify(created.body)).not.toContain("secret-pass");

    const [row] = await db.select().from(mailboxes).where(eq(mailboxes.email, "ada@harbor-dental.test"));
    expect(row?.smtpPasswordEncrypted).toBeTruthy();
    expect(row?.smtpPasswordEncrypted).not.toContain("secret-pass");
    expect(decryptString(row?.smtpPasswordEncrypted ?? "", config.encryptionKey)).toBe("secret-pass");

    const report = await agent.get(`/api/mailboxes/${created.body.mailbox.id}/deliverability`);
    expect(report.status).toBe(200);
    expect(report.body.deliverability.launchWarning).toContain("SPF");
    expect(report.body.deliverability.launchWarning).toContain("DMARC");
  });
});

function draft(overrides: Record<string, unknown> = {}) {
  return {
    fromName: "Ada Harbor",
    email: "ada@harbor-dental.test",
    provider: "smtp",
    presetId: "custom",
    smtpHost: "smtp.harbor-dental.test",
    smtpPort: 587,
    smtpSecurity: "starttls",
    smtpUsername: "ada@harbor-dental.test",
    imapHost: "imap.harbor-dental.test",
    imapPort: 993,
    imapSecurity: "ssl",
    imapUsername: "ada@harbor-dental.test",
    smtpPassword: "secret-pass",
    imapPassword: "secret-pass",
    dailyCap: 30,
    sendingDays: ["mon", "tue", "wed", "thu", "fri"],
    windowStart: "09:00",
    windowEnd: "17:00",
    timeZone: "UTC",
    minGapMinutes: 4,
    maxGapMinutes: 9,
    signature: "",
    ...overrides,
  };
}
