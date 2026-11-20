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
  generateToken,
  loadConfig,
  migrationsFolder,
  suppressions,
  unsubscribeTokens,
  type AppDatabase,
  type Config,
} from "@warmysender/core";
import { createApp } from "../app.js";

describe("unsubscribe route", () => {
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
      "truncate table unsubscribe_tokens, suppressions, enrollments, campaign_steps, campaigns, contacts restart identity cascade",
    ));
  });

  it("unsubscribes from the body link and from the one-click POST", async () => {
    const [contact] = await db
      .insert(contacts)
      .values({ email: "jane@harbor-dental.test", status: "active" })
      .returning();
    const [campaign] = await db.insert(campaigns).values({ name: "Intro", status: "running" }).returning();
    if (!contact || !campaign) throw new Error("seed failed");
    await db.insert(enrollments).values({
      campaignId: campaign.id,
      contactId: contact.id,
      status: "active",
      currentStep: 1,
    });
    const link = generateToken("unsub");
    await db.insert(unsubscribeTokens).values({
      tokenHash: link.hash,
      contactId: contact.id,
      campaignId: campaign.id,
    });

    const get = await request(app).get(`/u/${link.plaintext}`);
    expect(get.status).toBe(200);
    expect(get.text).toContain("unsubscribed");
    const updated = await db.select().from(contacts).where(eq(contacts.id, contact.id));
    expect(updated[0]?.status).toBe("unsubscribed");
    const stopped = await db.select().from(enrollments);
    expect(stopped[0]?.status).toBe("stopped");
    expect(stopped[0]?.stopReason).toBe("unsubscribe");
    const suppressed = await db.select().from(suppressions);
    expect(suppressed).toEqual([
      expect.objectContaining({ kind: "email", value: "jane@harbor-dental.test" }),
    ]);

    const again = await request(app).get(`/u/${link.plaintext}`);
    expect(again.status).toBe(200);
    expect(again.text).toContain("already unsubscribed");

    const [other] = await db
      .insert(contacts)
      .values({ email: "sam@harbor-dental.test", status: "active" })
      .returning();
    if (!other) throw new Error("seed failed");
    const postToken = generateToken("unsub");
    await db.insert(unsubscribeTokens).values({ tokenHash: postToken.hash, contactId: other.id });
    const post = await request(app)
      .post(`/u/${postToken.plaintext}`)
      .type("application/x-www-form-urlencoded")
      .send("List-Unsubscribe=One-Click");
    expect(post.status).toBe(200);
    expect(post.body).toEqual({ ok: true });
    const otherRow = await db.select().from(contacts).where(eq(contacts.id, other.id));
    expect(otherRow[0]?.status).toBe("unsubscribed");

    const ignored = await request(app)
      .post(`/u/${postToken.plaintext}`)
      .type("application/json")
      .send({});
    expect(ignored.status).toBe(400);

    const missing = await request(app).get("/u/not-a-real-token");
    expect(missing.status).toBe(404);
  });
});
