import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  apiKeys,
  databaseSchema,
  hashApiKey,
  loadConfig,
  migrationsFolder,
  users,
  type AppDatabase,
  type Config,
} from "@warmysender/core";
import { createApp } from "./app.js";

const PASSWORD = "correct-horse";

describe("auth", () => {
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
    await db.execute(
      sql.raw("truncate table audit_log, api_keys, sessions, invites, users restart identity cascade"),
    );
  });

  it("makes the first visitor an admin and requires an invite after that", async () => {
    const health = await request(app).get("/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ ok: true });

    const setup = await request(app).get("/api/auth/setup");
    expect(setup.body).toEqual({ hasUsers: false });

    const adminAgent = request.agent(app);
    const created = await adminAgent.post("/api/auth/register").send({
      email: "Ada@Harbor-Dental.test",
      password: PASSWORD,
      name: "Ada",
    });
    expect(created.status).toBe(201);
    expect(created.body.user.role).toBe("admin");
    expect(created.body.user.email).toBe("ada@harbor-dental.test");
    expect(created.body.user.passwordHash).toBeUndefined();

    const me = await adminAgent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe("admin");

    const blocked = await request(app).post("/api/auth/register").send({
      email: "bea@harbor-dental.test",
      password: PASSWORD,
    });
    expect(blocked.status).toBe(403);

    const invite = await adminAgent.post("/api/invites").send({ email: "bea@harbor-dental.test" });
    expect(invite.status).toBe(201);
    expect(invite.body.token).toMatch(/^inv_/);
    expect(invite.body.url).toBe(`http://localhost:3000/invite/${invite.body.token}`);

    const listed = await adminAgent.get("/api/invites");
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toContain(invite.body.token);

    const memberAgent = request.agent(app);
    const joined = await memberAgent.post("/api/auth/register").send({
      email: "bea@harbor-dental.test",
      password: PASSWORD,
      inviteToken: invite.body.token,
    });
    expect(joined.status).toBe(201);
    expect(joined.body.user.role).toBe("member");

    const reused = await request(app).post("/api/auth/register").send({
      email: "cy@harbor-dental.test",
      password: PASSWORD,
      inviteToken: invite.body.token,
    });
    expect(reused.status).toBe(403);

    const memberInvite = await memberAgent.post("/api/invites").send({});
    expect(memberInvite.status).toBe(403);

    const [adminRow] = await db.select().from(users).where(eq(users.email, "ada@harbor-dental.test"));
    const [memberRow] = await db.select().from(users).where(eq(users.email, "bea@harbor-dental.test"));
    expect(adminRow?.role).toBe("admin");
    expect(memberRow?.role).toBe("member");
  });

  it("shows an API key once and stores only the hash", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({
      email: "ada@harbor-dental.test",
      password: PASSWORD,
      name: "Ada",
    });

    const anonymous = await request(app).post("/api/api-keys").send({ name: "Claude" });
    expect(anonymous.status).toBe(401);

    const created = await agent.post("/api/api-keys").send({ name: "Claude" });
    expect(created.status).toBe(201);
    expect(created.body.key.startsWith("wsk_")).toBe(true);
    expect(created.body.prefix).toBe(created.body.key.slice(0, 12));

    const list = await agent.get("/api/api-keys");
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(created.body.key);
    expect(list.body.apiKeys[0].prefix).toBe(created.body.prefix);
    expect(list.body.apiKeys[0].key).toBeUndefined();

    const [row] = await db.select().from(apiKeys);
    expect(row?.keyHash).toBe(hashApiKey(created.body.key));
    expect(row?.keyHash).not.toContain(created.body.key);

    const revoked = await agent.delete(`/api/api-keys/${created.body.id}`);
    expect(revoked.status).toBe(204);
    const after = await agent.get("/api/api-keys");
    expect(after.body.apiKeys[0].revokedAt).toEqual(expect.any(String));
  });

  it("logs in and logs out", async () => {
    await request(app).post("/api/auth/register").send({
      email: "ada@harbor-dental.test",
      password: PASSWORD,
    });
    const agent = request.agent(app);
    const bad = await agent.post("/api/auth/login").send({
      email: "ada@harbor-dental.test",
      password: "wrong-password",
    });
    expect(bad.status).toBe(401);

    const good = await agent.post("/api/auth/login").send({
      email: "ada@harbor-dental.test",
      password: PASSWORD,
    });
    expect(good.status).toBe(200);
    expect(good.body.user.email).toBe("ada@harbor-dental.test");

    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(204);
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(401);
  });
});
