import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  databaseSchema,
  decryptString,
  encryptString,
  mailboxes,
  migrationsFolder,
  type AppDatabase,
} from "@warmysender/core";
import { createSmtpTransport } from "./smtp-transport.js";

const KEY = Buffer.alloc(32, 7);
const NOW = new Date("2026-01-15T12:00:00.000Z");

describe("Microsoft token refresh before send", () => {
  let db: AppDatabase;
  let close: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const client = new PGlite();
    close = () => client.close();
    const pglite = drizzle(client, { schema: databaseSchema });
    await migrate(pglite, { migrationsFolder: migrationsFolder() });
    db = pglite as unknown as AppDatabase;
  });

  afterAll(async () => {
    await close?.();
  });

  beforeEach(async () => {
    await db.execute(sql.raw("truncate table mailboxes restart identity cascade"));
  });

  it("refreshes an expired access token and does not report an auth failure", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({
        email: "ada@harbor-dental.test",
        provider: "microsoft",
        smtpHost: "smtp.office365.com",
        smtpPort: 587,
        oauthRefreshTokenEncrypted: encryptString("refresh-old", KEY),
        oauthAccessTokenEncrypted: encryptString("access-old", KEY),
        oauthAccessTokenExpiresAt: new Date(NOW.getTime() - 60_000),
      })
      .returning();
    if (!mailbox) throw new Error("seed failed");
    let fetches = 0;
    let usedToken = "";
    const transport = createSmtpTransport({
      db,
      encryptionKey: KEY,
      now: () => NOW,
      microsoft: {
        clientId: "client",
        clientSecret: "secret",
        tenant: "common",
        publicUrl: "https://app.example.test",
        sessionSecret: "session-secret-at-least-32-characters",
      },
      fetchToken: async () => {
        fetches += 1;
        return { access_token: "access-new", refresh_token: "refresh-new", expires_in: 3600 };
      },
      deliver: async (options) => {
        const auth = options.auth;
        if (auth && "accessToken" in auth && typeof auth.accessToken === "string") usedToken = auth.accessToken;
        return { messageId: "<sent@harbor-dental.test>" };
      },
    });
    const result = await transport.send(sampleEmail(), mailbox.id);
    expect(result.ok).toBe(true);
    expect(fetches).toBe(1);
    expect(usedToken).toBe("access-new");
    const stored = await db.select().from(mailboxes).where(eq(mailboxes.id, mailbox.id));
    expect(decryptString(stored[0]?.oauthAccessTokenEncrypted ?? "", KEY)).toBe("access-new");
    expect(decryptString(stored[0]?.oauthRefreshTokenEncrypted ?? "", KEY)).toBe("refresh-new");
  });

  it("keeps a fresh access token and does not call Microsoft", async () => {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({
        email: "ada@harbor-dental.test",
        provider: "microsoft",
        smtpHost: "smtp.office365.com",
        oauthRefreshTokenEncrypted: encryptString("refresh-old", KEY),
        oauthAccessTokenEncrypted: encryptString("access-fresh", KEY),
        oauthAccessTokenExpiresAt: new Date(NOW.getTime() + 30 * 60_000),
      })
      .returning();
    if (!mailbox) throw new Error("seed failed");
    let fetches = 0;
    const transport = createSmtpTransport({
      db,
      encryptionKey: KEY,
      now: () => NOW,
      microsoft: {
        clientId: "client",
        clientSecret: "secret",
        tenant: "common",
        publicUrl: "https://app.example.test",
        sessionSecret: "session-secret-at-least-32-characters",
      },
      fetchToken: async () => {
        fetches += 1;
        return {};
      },
      deliver: async () => ({ messageId: "<sent@harbor-dental.test>" }),
    });
    const result = await transport.send(sampleEmail(), mailbox.id);
    expect(result.ok).toBe(true);
    expect(fetches).toBe(0);
  });
});

function sampleEmail() {
  return {
    from: "Ada <ada@harbor-dental.test>",
    to: "jane@harbor-dental.test",
    subject: "Quick question",
    messageId: "<msg@harbor-dental.test>",
    text: "Hello",
    html: null,
    inReplyTo: null,
    references: null,
    listUnsubscribe: "<https://app.example.test/u/tok>",
    listUnsubscribePost: "List-Unsubscribe=One-Click",
  };
}
