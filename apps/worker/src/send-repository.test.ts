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

  it("stores a pending Message-ID before SMTP and does not resend after a crash", async () => {
    await seed();
    let pendingDuringSend: { status: string; messageId: string | null } | undefined;
    await executeSendTick({
      db,
      now: NOW,
      publicUrl: "https://app.example.test",
      transport: {
        send: async (email) => {
          const rows = await db.select().from(messages);
          pendingDuringSend = { status: rows[0]?.status ?? "", messageId: rows[0]?.messageId ?? null };
          expect(rows[0]?.messageId).toBe(email.messageId);
          return { ok: true, messageId: email.messageId };
        },
      },
      rng: () => 0,
    });
    expect(pendingDuringSend).toEqual({ status: "pending", messageId: expect.stringContaining("@harbor-dental.test") });

    await db.execute(sql.raw("truncate table audit_log, messages, unsubscribe_tokens, suppressions, enrollments, campaign_mailboxes, campaign_steps, campaigns, contacts, mailboxes restart identity cascade"));
    await seed();
    await executeSendTick({
      db,
      now: NOW,
      publicUrl: "https://app.example.test",
      transport: { send: async () => ({ ok: true }) },
      rng: () => 0,
      stopAfterPersist: true,
    });
    const pending = await db.select().from(messages);
    expect(pending[0]?.status).toBe("pending");
    expect(pending[0]?.messageId).toContain("@harbor-dental.test");

    let calls = 0;
    await executeSendTick({
      db,
      now: new Date(NOW.getTime() + 10 * 60_000),
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
    const failed = await db.select().from(messages);
    expect(failed[0]?.status).toBe("failed");
    expect(failed[0]?.error).toBe("outcome_unknown");
    const enrollment = await db.select().from(enrollments);
    expect(enrollment[0]?.status).toBe("stopped");
    expect(enrollment[0]?.stopReason).toBe("outcome_unknown");
  });

  it("lets only one of two workers send from a mailbox", async () => {
    await seed();
    let release: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const first = executeSendTick({
      db,
      now: NOW,
      publicUrl: "https://app.example.test",
      transport: {
        send: async () => {
          calls += 1;
          await hold;
          return { ok: true };
        },
      },
      rng: () => 0,
    });
    await waitFor(() => calls === 1);
    await executeSendTick({
      db,
      now: NOW,
      publicUrl: "https://app.example.test",
      transport: {
        send: async () => {
          calls += 1;
          return { ok: true };
        },
      },
      rng: () => 0,
    });
    expect(calls).toBe(1);
    release?.();
    await first;
    expect(calls).toBe(1);
    const stored = await db.select().from(messages);
    expect(stored.filter((row) => row.status === "sent")).toHaveLength(1);
  });

  it("bounces 5.1.1 and records a 5.7.1 policy block without suppressing", async () => {
    await seed();
    await executeSendTick({
      db,
      now: NOW,
      publicUrl: "https://app.example.test",
      transport: { send: async () => ({ ok: false, failure: { responseCode: 554, enhancedCode: "5.7.1" } }) },
      rng: () => 0,
    });
    const contact = await db.select().from(contacts);
    expect(contact[0]?.status).toBe("active");
    expect(await db.select().from(suppressions)).toHaveLength(0);
    const stored = await db.select().from(messages);
    expect(stored[0]?.status).toBe("failed");
    expect(stored[0]?.error).toContain("5.7.1");
    const box = await db.select().from(mailboxes);
    expect(box[0]?.consecutivePolicyFailures).toBe(1);
    const enrollment = await db.select().from(enrollments);
    expect(enrollment[0]?.stopReason).toBe("policy_block");
  });

  it("appends the mailbox signature and leaves campaign variables for Task 03", async () => {
    const ids = await seed();
    await db.update(mailboxes).set({ signature: "Ada\nHarbor Dental" }).where(eq(mailboxes.id, ids.mailboxId));
    await db.update(contacts).set({ firstName: "Jane", company: "" });
    await db.update(campaignSteps).set({
      subject: "Hi {{company|the practice}}",
      body: "Hello {{first_name}} {{unsubscribe_link}}",
    });
    let text = "";
    let subject = "";
    await executeSendTick({
      db,
      now: NOW,
      publicUrl: "https://app.example.test",
      transport: {
        send: async (email) => {
          text = email.text;
          subject = email.subject;
          return { ok: true, messageId: email.messageId };
        },
      },
      rng: () => 0,
    });
    expect(subject).toBe("Hi the practice");
    expect(text).toContain("Hello Jane");
    expect(text).not.toContain("{{first_name}}");
    expect(text).toContain("https://app.example.test/u/unsub_");
    expect(text).toContain("Ada\nHarbor Dental");
  });

  it("fails the step when a variable has no value and no fallback", async () => {
    await seed();
    await db.update(campaignSteps).set({ body: "Hello {{first_name}}" });
    let calls = 0;
    await executeSendTick({
      db,
      now: NOW,
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
    const stored = await db.select().from(messages);
    expect(stored[0]?.status).toBe("failed");
    expect(stored[0]?.error).toBe("missing_variable:first_name");
    const enrollment = await db.select().from(enrollments);
    expect(enrollment[0]?.status).toBe("stopped");
    expect(enrollment[0]?.stopReason).toBe("missing_variable");
  });
});

async function waitFor(ready: () => boolean): Promise<void> {
  const started = Date.now();
  while (!ready()) {
    if (Date.now() - started > 5_000) throw new Error("timed out waiting for the first send");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
