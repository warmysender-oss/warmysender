import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  campaignMailboxes,
  campaignSteps,
  campaigns,
  contacts,
  databaseSchema,
  enrollments,
  mailboxes,
  messages,
  migrationsFolder,
  suppressions,
  unsubscribeTokens,
  type AppDatabase,
  type SmtpTransport,
} from "@warmysender/core";
import { executeSendTick } from "./send-repository.js";

const NOW = new Date("2026-01-15T12:00:00.000Z");

describe("send repository", () => {
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
    await db.execute(sql.raw(
      "truncate table audit_log, messages, unsubscribe_tokens, suppressions, enrollments, campaign_mailboxes, campaign_steps, campaigns, contacts, mailboxes restart identity cascade",
    ));
  });

  async function seed(): Promise<{ mailboxId: string }> {
    const [mailbox] = await db
      .insert(mailboxes)
      .values({
        email: "ada@harbor-dental.test",
        fromName: "Ada",
        sendingDays: [1, 2, 3, 4, 5, 6, 7],
        windowStart: "00:00",
        windowEnd: "00:00",
        timezone: "UTC",
        rampStartedOn: "2020-01-01",
        dailyCap: 30,
        gapMinMinutes: 4,
        gapMaxMinutes: 9,
      })
      .returning();
    const [contact] = await db
      .insert(contacts)
      .values({ email: "jane@harbor-dental.test", status: "active" })
      .returning();
    const [campaign] = await db.insert(campaigns).values({ name: "Intro", status: "running" }).returning();
    if (!mailbox || !contact || !campaign) throw new Error("seed failed");
    const [step] = await db
      .insert(campaignSteps)
      .values({
        campaignId: campaign.id,
        position: 1,
        subject: "Quick question",
        body: "Hello {{unsubscribe_link}}",
        delayDays: 0,
      })
      .returning();
    if (!step) throw new Error("seed failed");
    await db.insert(campaignMailboxes).values({ campaignId: campaign.id, mailboxId: mailbox.id });
    await db.insert(enrollments).values({
      campaignId: campaign.id,
      contactId: contact.id,
      mailboxId: mailbox.id,
      currentStep: 1,
      nextSendAt: NOW,
      status: "active",
    });
    return { mailboxId: mailbox.id };
  }

  it("sends a due step, stores the thread, and keeps the random gap", async () => {
    const ids = await seed();
    const seen: { subject: string; listUnsubscribe: string; inReplyTo: string | null }[] = [];
    const transport: SmtpTransport = {
      send: async (email) => {
        seen.push({
          subject: email.subject,
          listUnsubscribe: email.listUnsubscribe,
          inReplyTo: email.inReplyTo,
        });
        return { ok: true, messageId: email.messageId };
      },
    };
    await executeSendTick({
      db,
      now: NOW,
      publicUrl: "https://app.example.test",
      transport,
      rng: () => 0,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.subject).toBe("Quick question");
    expect(seen[0]?.inReplyTo).toBeNull();
    expect(seen[0]?.listUnsubscribe).toMatch(/^<https:\/\/app\.example\.test\/u\/unsub_/);
    expect(seen[0]?.listUnsubscribe.toLowerCase()).not.toContain("mailto:");

    const stored = await db.select().from(messages);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.status).toBe("sent");
    expect(stored[0]?.messageId).toContain("@harbor-dental.test");
    expect(stored[0]?.bodyText).toContain("https://app.example.test/u/unsub_");

    const enrollment = await db.select().from(enrollments);
    expect(enrollment[0]?.status).toBe("completed");
    const box = await db.select().from(mailboxes).where(eq(mailboxes.id, ids.mailboxId));
    expect(box[0]?.nextGapMinutes).toBe(4);
    expect(box[0]?.lastSendAt?.toISOString()).toBe(NOW.toISOString());
    const tokens = await db.select().from(unsubscribeTokens);
    expect(tokens).toHaveLength(1);
    const logs = await db.select().from(auditLog);
    expect(logs.some((row) => JSON.stringify(row.detail).includes("[send] sent"))).toBe(true);
  });

  it("marks a 5xx as bounced and suppressed, and will not send again", async () => {
    await seed();
    const transport: SmtpTransport = {
      send: async () => ({ ok: false, failure: { responseCode: 550, enhancedCode: "5.1.1" } }),
    };
    await executeSendTick({ db, now: NOW, publicUrl: "https://app.example.test", transport, rng: () => 0 });
    const contact = await db.select().from(contacts);
    expect(contact[0]?.status).toBe("bounced");
    const suppressed = await db.select().from(suppressions);
    expect(suppressed[0]?.value).toBe("jane@harbor-dental.test");
    const enrollment = await db.select().from(enrollments);
    expect(enrollment[0]?.status).toBe("stopped");
    expect(enrollment[0]?.stopReason).toBe("bounce");
    const stored = await db.select().from(messages);
    expect(stored[0]?.status).toBe("failed");

    let calls = 0;
    await executeSendTick({
      db,
      now: new Date(NOW.getTime() + 60 * 60_000),
      publicUrl: "https://app.example.test",
      transport: {
        send: async () => {
          calls += 1;
          return { ok: true };
        },
      },
      rng: () => 0,
    });
    expect(calls).toBe(0);
  });
});
