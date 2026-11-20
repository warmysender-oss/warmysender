import { desc, eq } from "drizzle-orm";
import {
  decryptString,
  encryptString,
  inboundMessages,
  mailboxes,
  messages,
  replyDrafts,
  settings,
  verifyApiKey,
  apiKeys,
  type AppDatabase,
} from "@warmysender/core";
import { createDomainServices } from "./domain-services.js";
import { ApiError } from "./errors.js";
import { loadStatsOverview } from "../stats/queries.js";
import type {
  AppServices,
  Campaign,
  CampaignStats,
  MailboxHealth,
  MailboxSummary,
  Page,
  ReplyDraft,
  ReplyKind,
  ReplySummary,
  ReplyThread,
} from "./services.js";

const PAGE_DEFAULT = 50;

export function createDbServices(
  db: AppDatabase,
  options?: { now?: () => Date; publicUrl?: string | null },
): AppServices {
  const now = options?.now ?? (() => new Date());
  const domain = createDomainServices(db, options);

  return {
    ...domain,
    campaigns: {
      ...domain.campaigns,
      async stats(id) {
        const campaign = await domain.campaigns.get(id);
        if (!campaign) return null;
        return campaignStats(db, campaign);
      },
    },
    replies: {
      async list(args) {
        const limit = args.limit ?? PAGE_DEFAULT;
        const offset = offsetOf(args.cursor);
        const rows = await db.select().from(inboundMessages).orderBy(desc(inboundMessages.receivedAt)).limit(limit).offset(offset);
        return page(rows.map(toReply), offset, limit, rows.length);
      },
      async getThread(id) {
        const [row] = await db.select().from(inboundMessages).where(eq(inboundMessages.id, id)).limit(1);
        if (!row) return null;
        const related = row.contactId
          ? await db.select().from(inboundMessages).where(eq(inboundMessages.contactId, row.contactId)).orderBy(inboundMessages.receivedAt)
          : [row];
        const outbound = row.contactId
          ? await db.select().from(messages).where(eq(messages.contactId, row.contactId)).orderBy(messages.createdAt)
          : [];
        const thread: ReplyThread = {
          ...toReply(row),
          messages: [
            ...outbound.map((message) => ({
              id: message.id,
              direction: "outbound" as const,
              from_email: "",
              subject: message.subject,
              body: message.bodyText,
              at: (message.sentAt ?? message.createdAt).toISOString(),
            })),
            ...related.map((message) => ({
              id: message.id,
              direction: "inbound" as const,
              from_email: message.fromEmail,
              subject: message.subject,
              body: message.bodyText,
              at: message.receivedAt.toISOString(),
            })),
          ],
        };
        return thread;
      },
      async saveDraft(replyId, body) {
        const [reply] = await db.select().from(inboundMessages).where(eq(inboundMessages.id, replyId)).limit(1);
        if (!reply) return null;
        const [row] = await db
          .insert(replyDrafts)
          .values({
            inboundMessageId: reply.id,
            enrollmentId: reply.enrollmentId,
            mailboxId: reply.mailboxId,
            body,
            status: "draft",
          })
          .returning();
        if (!row) throw new ApiError(500, "internal_error", "Draft was not saved.");
        const draft: ReplyDraft = {
          id: row.id,
          reply_id: replyId,
          body: row.body,
          created_at: row.createdAt.toISOString(),
        };
        return draft;
      },
    },
    mailboxes: {
      async list() {
        const rows = await db.select().from(mailboxes).orderBy(desc(mailboxes.createdAt));
        return rows.map(toMailbox);
      },
      async health(id) {
        const [row] = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).limit(1);
        if (!row) return null;
        return mailboxHealth(db, row, now());
      },
    },
  };
}

export async function authenticateApiKey(db: AppDatabase, token: string): Promise<{ userId: string } | null> {
  if (token.length < 12) return null;
  const prefix = token.slice(0, 12);
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyPrefix, prefix));
  for (const row of rows) {
    if (row.revokedAt) continue;
    if (!verifyApiKey(token, row.keyHash)) continue;
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
    return { userId: row.createdBy };
  }
  return null;
}

export function createWarmyStores(db: AppDatabase, encryptionKey: Buffer) {
  return {
    keys: {
      async getKey(): Promise<string | null> {
        const [row] = await db.select().from(settings).where(eq(settings.id, "default")).limit(1);
        if (!row?.warmysenderApiKeyEncrypted) return null;
        return decryptString(row.warmysenderApiKeyEncrypted, encryptionKey);
      },
      async setKey(key: string | null): Promise<void> {
        const encrypted = key === null ? null : encryptString(key, encryptionKey);
        await db
          .insert(settings)
          .values({ id: "default", warmysenderApiKeyEncrypted: encrypted, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: settings.id,
            set: { warmysenderApiKeyEncrypted: encrypted, updatedAt: new Date() },
          });
      },
    },
    links: {
      async get(localMailboxId: string): Promise<string | null> {
        const [row] = await db
          .select({ warmysenderMailboxId: mailboxes.warmysenderMailboxId })
          .from(mailboxes)
          .where(eq(mailboxes.id, localMailboxId))
          .limit(1);
        return row?.warmysenderMailboxId ?? null;
      },
      async set(localMailboxId: string, warmyMailboxId: string): Promise<void> {
        await db
          .update(mailboxes)
          .set({ warmysenderMailboxId: warmyMailboxId, updatedAt: new Date() })
          .where(eq(mailboxes.id, localMailboxId));
      },
    },
    async getMailbox(id: string) {
      const [row] = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).limit(1);
      if (!row) return null;
      const microsoft = row.provider === "microsoft";
      const smtpPassword = row.smtpPasswordEncrypted ? decryptString(row.smtpPasswordEncrypted, encryptionKey) : null;
      const imapPassword = row.imapPasswordEncrypted ? decryptString(row.imapPasswordEncrypted, encryptionKey) : null;
      return {
        id: row.id,
        fromName: row.fromName || null,
        email: row.email,
        kind: microsoft ? ("microsoft" as const) : ("smtp" as const),
        smtp:
          microsoft || !smtpPassword
            ? null
            : { host: row.smtpHost, port: row.smtpPort, username: row.smtpUsername, password: smtpPassword },
        imap:
          microsoft || !imapPassword
            ? null
            : { host: row.imapHost, port: row.imapPort, username: row.imapUsername, password: imapPassword },
      };
    },
  };
}

function toMailbox(row: typeof mailboxes.$inferSelect): MailboxSummary {
  return {
    id: row.id,
    email: row.email,
    provider: row.provider === "microsoft" ? "microsoft" : "smtp",
    paused: row.health === "paused",
    paused_reason: row.pausedReason,
  };
}

function toReply(row: typeof inboundMessages.$inferSelect): ReplySummary {
  const kind: ReplyKind =
    row.kind === "auto_reply" || row.kind === "bounce" || row.kind === "other" ? row.kind : "reply";
  return {
    id: row.id,
    mailbox_id: row.mailboxId,
    contact_id: row.contactId,
    from_email: row.fromEmail,
    subject: row.subject,
    received_at: row.receivedAt.toISOString(),
    kind,
  };
}

async function campaignStats(db: AppDatabase, campaign: Campaign): Promise<CampaignStats> {
  const overview = await loadStatsOverview(db);
  const row = overview.campaigns.find((item) => item.campaignId === campaign.id);
  return {
    campaign_id: campaign.id,
    sent: row?.sent ?? 0,
    replies: row?.replies ?? 0,
    reply_rate: row && row.sent > 0 ? row.replyRate : null,
    bounces: row?.bounces ?? 0,
    unsubscribes: row?.unsubscribes ?? 0,
    still_in_sequence: row?.stillInSequence ?? 0,
    steps: campaign.steps.map((step) => {
      const stat = row?.steps.find((item) => item.stepId === step.id);
      return {
        step_id: step.id,
        position: step.position,
        sent: stat?.sent ?? 0,
        replies: stat?.replies ?? 0,
        bounces: stat?.bounces ?? 0,
        unsubscribes: stat?.unsubscribes ?? 0,
      };
    }),
  };
}

async function mailboxHealth(db: AppDatabase, row: typeof mailboxes.$inferSelect, now: Date): Promise<MailboxHealth> {
  const overview = await loadStatsOverview(db, now);
  const day = overview.mailboxes.find((item) => item.mailboxId === row.id);
  return {
    ...toMailbox(row),
    sent_today: day?.sentToday ?? 0,
    cap_today: day?.effectiveCap ?? row.dailyCap,
    ramp_day: day && day.rampPhase !== "graduated" ? day.rampDay : null,
    health: row.health,
  };
}

function page<T>(items: T[], offset: number, limit: number, returned: number): Page<T> {
  return { items, next_cursor: returned === limit ? String(offset + limit) : null };
}

function offsetOf(cursor: string | undefined): number {
  if (!cursor) return 0;
  const value = Number(cursor);
  if (!Number.isInteger(value) || value < 0) throw new ApiError(400, "validation_error", "cursor is not valid.");
  return value;
}
