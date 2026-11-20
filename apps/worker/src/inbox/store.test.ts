import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  contacts,
  databaseSchema,
  enrollments,
  inboundMessages,
  migrationsFolder,
  suppressions,
  type AppDatabase,
} from "@warmysender/core";
import { decideInbound, effectPlan } from "./decide.js";
import { parseRawEmail } from "./parse-raw.js";
import { applyInboundCommit, loadSentMessages } from "./store.js";
import type { CommitEvent } from "./poll.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

async function seed(db: AppDatabase) {
  const [mailbox] = await db
    .insert(databaseSchema.mailboxes)
    .values({ email: "alex@harbor-dental.test", imapHost: "imap.harbor-dental.test" })
    .returning();
  const [contact] = await db
    .insert(contacts)
    .values({ email: "jane@river-clinic.test", status: "active" })
    .returning();
  const [campaign] = await db.insert(databaseSchema.campaigns).values({ name: "Intro" }).returning();
  const [step] = await db
    .insert(databaseSchema.campaignSteps)
    .values({ campaignId: campaign!.id, position: 1, subject: "Intro", body: "Hello" })
    .returning();
  const [enrollment] = await db
    .insert(enrollments)
    .values({ campaignId: campaign!.id, contactId: contact!.id, mailboxId: mailbox!.id, status: "active" })
    .returning();
  await db.insert(databaseSchema.messages).values({
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
  });
  return { mailboxId: mailbox!.id, contactId: contact!.id, enrollmentId: enrollment!.id };
}

describe("applyInboundCommit", () => {
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
    await db.execute(
      sql.raw(
        "truncate table audit_log, reply_drafts, inbound_messages, messages, enrollments, campaign_steps, campaigns, suppressions, contacts, mailboxes restart identity cascade",
      ),
    );
  });

  async function commitFixture(name: string, uid: number) {
    const seeded = await seed(db);
    const sent = await loadSentMessages(db);
    const mail = parseRawEmail(readFileSync(join(fixtures, name), "utf8"));
    const decision = decideInbound(mail, sent);
    const event: CommitEvent = { uid, mail, decision, plan: effectPlan(decision), lastSeenUid: uid };
    await applyInboundCommit(db, seeded.mailboxId, event);
    return { seeded, decision };
  }

  it("stops every active enrollment when a real reply is stored", async () => {
    const { seeded } = await commitFixture("reply-in-reply-to.eml", 4);
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, seeded.contactId));
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.id, seeded.enrollmentId));
    const [stored] = await db.select().from(inboundMessages);
    expect(contact?.status).toBe("replied");
    expect(enrollment?.status).toBe("stopped");
    expect(enrollment?.stopReason).toBe("reply");
    expect(stored?.kind).toBe("reply");
  });

  it("stores an auto-reply without stopping the sequence", async () => {
    const { seeded } = await commitFixture("auto-reply-ooo.eml", 5);
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, seeded.contactId));
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.id, seeded.enrollmentId));
    const [stored] = await db.select().from(inboundMessages);
    expect(contact?.status).toBe("active");
    expect(enrollment?.status).toBe("active");
    expect(stored?.kind).toBe("auto_reply");
  });

  it("suppresses the recipient of a permanent DSN and stores a delay as other", async () => {
    const bounced = await commitFixture("dsn-failure.eml", 6);
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, bounced.seeded.contactId));
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.id, bounced.seeded.enrollmentId));
    const suppressed = await db.select().from(suppressions);
    expect(contact?.status).toBe("bounced");
    expect(enrollment?.status).toBe("stopped");
    expect(enrollment?.stopReason).toBe("bounce");
    expect(suppressed.map((row) => row.value)).toEqual(["jane@river-clinic.test"]);

    await db.execute(
      sql.raw(
        "truncate table inbound_messages, messages, enrollments, campaign_steps, campaigns, suppressions, contacts, mailboxes restart identity cascade",
      ),
    );
    const delayed = await commitFixture("dsn-delayed.eml", 7);
    const [stillActive] = await db.select().from(contacts).where(eq(contacts.id, delayed.seeded.contactId));
    const [stored] = await db.select().from(inboundMessages);
    const suppressedAfter = await db.select().from(suppressions);
    expect(delayed.decision.kind).toBe("delivery_delay");
    expect(stillActive?.status).toBe("active");
    expect(stored?.kind).toBe("other");
    expect(suppressedAfter).toEqual([]);
  });
});
