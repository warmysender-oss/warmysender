import { desc, eq } from "drizzle-orm";
import { auditLog, mailboxes, type AppDatabase, type MailboxHealthState, type SocketSecurity } from "@warmysender/core";
import type { MailboxRecord, MailboxStore } from "./types.js";

type MailboxRow = typeof mailboxes.$inferSelect;

export function createDrizzleMailboxStore(db: AppDatabase): MailboxStore {
  return {
    async list() {
      const rows = await db.select().from(mailboxes);
      return rows.map(toRecord);
    },
    async findById(id) {
      const rows = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).limit(1);
      const row = rows[0];
      return row ? toRecord(row) : null;
    },
    async findByEmail(email) {
      const rows = await db.select().from(mailboxes).where(eq(mailboxes.email, email)).limit(1);
      const row = rows[0];
      return row ? toRecord(row) : null;
    },
    async insert(record) {
      await db.insert(mailboxes).values(toRow(record));
      return record;
    },
    async update(id, patch) {
      const current = await this.findById(id);
      if (!current) throw new Error("Mailbox not found.");
      const next = { ...current, ...patch, id };
      await db.update(mailboxes).set(toRow(next)).where(eq(mailboxes.id, id));
      return next;
    },
  };
}

export async function latestHeartbeatAt(db: AppDatabase): Promise<Date | null> {
  const rows = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, "heartbeat"))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const at = row.detail["at"];
  if (typeof at === "string") {
    const parsed = new Date(at);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return row.createdAt;
}

function toRecord(row: MailboxRow): MailboxRecord {
  return {
    id: row.id,
    fromName: row.fromName,
    email: row.email,
    provider: row.provider,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpSecurity: security(row.smtpSecurity),
    smtpUsername: row.smtpUsername,
    smtpPasswordEncrypted: row.smtpPasswordEncrypted,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    imapSecurity: security(row.imapSecurity),
    imapUsername: row.imapUsername,
    imapPasswordEncrypted: row.imapPasswordEncrypted,
    oauthRefreshTokenEncrypted: row.oauthRefreshTokenEncrypted,
    oauthAccessTokenEncrypted: row.oauthAccessTokenEncrypted,
    oauthAccessTokenExpiresAt: row.oauthAccessTokenExpiresAt ? row.oauthAccessTokenExpiresAt.toISOString() : null,
    sendingDays: row.sendingDays,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    timezone: row.timezone,
    gapMinMinutes: row.gapMinMinutes,
    gapMaxMinutes: row.gapMaxMinutes,
    dailyCap: row.dailyCap,
    signature: row.signature,
    rampStartedOn: row.rampStartedOn,
    health: health(row.health),
    pausedReason: row.pausedReason,
    consecutiveAuthFailures: row.consecutiveAuthFailures,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRow(record: MailboxRecord): typeof mailboxes.$inferInsert {
  return {
    id: record.id,
    fromName: record.fromName,
    email: record.email,
    provider: record.provider,
    smtpHost: record.smtpHost,
    smtpPort: record.smtpPort,
    smtpSecurity: record.smtpSecurity,
    smtpUsername: record.smtpUsername,
    smtpPasswordEncrypted: record.smtpPasswordEncrypted,
    imapHost: record.imapHost,
    imapPort: record.imapPort,
    imapSecurity: record.imapSecurity,
    imapUsername: record.imapUsername,
    imapPasswordEncrypted: record.imapPasswordEncrypted,
    oauthRefreshTokenEncrypted: record.oauthRefreshTokenEncrypted,
    oauthAccessTokenEncrypted: record.oauthAccessTokenEncrypted,
    oauthAccessTokenExpiresAt: record.oauthAccessTokenExpiresAt ? new Date(record.oauthAccessTokenExpiresAt) : null,
    sendingDays: record.sendingDays,
    windowStart: record.windowStart,
    windowEnd: record.windowEnd,
    timezone: record.timezone,
    gapMinMinutes: record.gapMinMinutes,
    gapMaxMinutes: record.gapMaxMinutes,
    dailyCap: record.dailyCap,
    signature: record.signature,
    rampStartedOn: record.rampStartedOn,
    health: record.health,
    pausedReason: record.pausedReason,
    consecutiveAuthFailures: record.consecutiveAuthFailures,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function security(value: string): SocketSecurity {
  if (value === "ssl" || value === "starttls" || value === "none") return value;
  return "starttls";
}

function health(value: string): MailboxHealthState {
  if (value === "unknown" || value === "healthy" || value === "paused") return value;
  return "unknown";
}
