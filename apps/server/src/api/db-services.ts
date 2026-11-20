import { and, count, desc, eq, inArray, or } from "drizzle-orm";
import {
  campaignMailboxes,
  campaignSteps,
  campaigns,
  contacts,
  decryptString,
  encryptString,
  enrollments,
  inboundMessages,
  listMembers,
  lists,
  mailboxes,
  messages,
  replyDrafts,
  settings,
  suppressions,
  verifyApiKey,
  apiKeys,
  type AppDatabase,
} from "@warmysender/core";
import { ApiError } from "./errors.js";
import { isUniqueViolation } from "../http.js";
import { loadStatsOverview } from "../stats/queries.js";
import type {
  AppServices,
  Campaign,
  CampaignStats,
  Contact,
  ContactInput,
  ContactStatus,
  MailboxHealth,
  MailboxSummary,
  Page,
  ReplyDraft,
  ReplyKind,
  ReplySummary,
  ReplyThread,
} from "./services.js";
import { CONTACT_STATUSES } from "./services.js";

const PAGE_DEFAULT = 50;

export function createDbServices(db: AppDatabase, options?: { now?: () => Date }): AppServices {
  const now = options?.now ?? (() => new Date());

  return {
    contacts: {
      async create(input) {
        if (await suppressed(db, input.email)) throw new ApiError(409, "suppressed", "That address is suppressed.");
        try {
          const [row] = await db.insert(contacts).values(contactValues(input)).returning();
          if (!row) throw new ApiError(500, "internal_error", "Contact was not saved.");
          return toContact(row);
        } catch (error) {
          if (isUniqueViolation(error)) throw new ApiError(409, "duplicate", "duplicate");
          throw error;
        }
      },
      async bulkCreate(inputs) {
        const created: Contact[] = [];
        const skipped: { email: string; reason: string }[] = [];
        for (const input of inputs) {
          if (await suppressed(db, input.email)) {
            skipped.push({ email: input.email, reason: "suppressed" });
            continue;
          }
          try {
            const [row] = await db.insert(contacts).values(contactValues(input)).returning();
            if (row) created.push(toContact(row));
          } catch (error) {
            if (isUniqueViolation(error)) skipped.push({ email: input.email, reason: "duplicate" });
            else throw error;
          }
        }
        return { created, skipped };
      },
      async list(args) {
        const limit = args.limit ?? PAGE_DEFAULT;
        const offset = offsetOf(args.cursor);
        const where = args.status ? eq(contacts.status, args.status) : undefined;
        const rows = await db.select().from(contacts).where(where).orderBy(desc(contacts.createdAt)).limit(limit).offset(offset);
        return page(rows.map(toContact), offset, limit, rows.length);
      },
      async updateStatus(id, status) {
        const [row] = await db.update(contacts).set({ status, updatedAt: now() }).where(eq(contacts.id, id)).returning();
        return row ? toContact(row) : null;
      },
      async findByEmails(emails) {
        if (emails.length === 0) return [];
        const lowered = emails.map((email) => email.toLowerCase());
        const rows = await db.select().from(contacts).where(inArray(contacts.email, lowered));
        return rows.map(toContact);
      },
    },
    lists: {
      async create(name) {
        const [row] = await db.insert(lists).values({ name }).returning();
        if (!row) throw new ApiError(500, "internal_error", "List was not saved.");
        return { id: row.id, name: row.name, contact_count: 0 };
      },
      async list(args) {
        const limit = args.limit ?? PAGE_DEFAULT;
        const offset = offsetOf(args.cursor);
        const rows = await db.select().from(lists).orderBy(desc(lists.createdAt)).limit(limit).offset(offset);
        const items = await Promise.all(rows.map(async (row) => ({ id: row.id, name: row.name, contact_count: await listCount(db, row.id) })));
        return page(items, offset, limit, rows.length);
      },
      async addContacts(listId, contactIds) {
        const [list] = await db.select({ id: lists.id }).from(lists).where(eq(lists.id, listId)).limit(1);
        if (!list) return null;
        let added = 0;
        for (const contactId of contactIds) {
          const [contact] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
          if (!contact) continue;
          const inserted = await db
            .insert(listMembers)
            .values({ listId, contactId })
            .onConflictDoNothing()
            .returning();
          added += inserted.length;
        }
        return { added };
      },
      async emails(listId) {
        const [list] = await db.select({ id: lists.id }).from(lists).where(eq(lists.id, listId)).limit(1);
        if (!list) return null;
        const rows = await db
          .select({ email: contacts.email })
          .from(listMembers)
          .innerJoin(contacts, eq(listMembers.contactId, contacts.id))
          .where(eq(listMembers.listId, listId));
        return rows.map((row) => row.email);
      },
    },
    campaigns: {
      async create(input) {
        const [row] = await db.insert(campaigns).values({ name: input.name, status: "draft" }).returning();
        if (!row) throw new ApiError(500, "internal_error", "Campaign was not saved.");
        return { id: row.id, name: row.name, status: "draft", mailbox_ids: [], steps: [] };
      },
      async get(id) {
        return loadCampaign(db, id);
      },
      async update(id, input) {
        const existing = await loadCampaign(db, id);
        if (!existing) return null;
        if (input.name !== undefined) {
          await db.update(campaigns).set({ name: input.name, updatedAt: now() }).where(eq(campaigns.id, id));
        }
        if (input.mailbox_ids) {
          await replaceMailboxes(db, id, input.mailbox_ids);
        }
        return loadCampaign(db, id);
      },
      async addStep(campaignId, input) {
        const campaign = await loadCampaign(db, campaignId);
        if (!campaign) return null;
        const position = campaign.steps.length + 1;
        const [row] = await db
          .insert(campaignSteps)
          .values({ campaignId, position, subject: input.subject, body: input.body, delayDays: input.delay_days })
          .returning();
        if (!row) throw new ApiError(500, "internal_error", "Step was not saved.");
        return toStep(row);
      },
      async updateStep(campaignId, stepId, input) {
        const [existing] = await db
          .select()
          .from(campaignSteps)
          .where(and(eq(campaignSteps.id, stepId), eq(campaignSteps.campaignId, campaignId)))
          .limit(1);
        if (!existing) return null;
        const [row] = await db
          .update(campaignSteps)
          .set({
            subject: input.subject === undefined ? existing.subject : input.subject,
            body: input.body === undefined ? existing.body : input.body,
            delayDays: input.delay_days === undefined ? existing.delayDays : input.delay_days,
            updatedAt: now(),
          })
          .where(eq(campaignSteps.id, stepId))
          .returning();
        return row ? toStep(row) : null;
      },
      async deleteStep(campaignId, stepId) {
        const removed = await db
          .delete(campaignSteps)
          .where(and(eq(campaignSteps.id, stepId), eq(campaignSteps.campaignId, campaignId)))
          .returning({ id: campaignSteps.id });
        return removed.length > 0;
      },
      async start(id) {
        const campaign = await loadCampaign(db, id);
        if (!campaign) return null;
        const problems = await launchProblems(db, campaign);
        if (problems.length > 0) return { started: false, problems, campaign };
        const [row] = await db
          .update(campaigns)
          .set({ status: "running", launchedAt: now(), updatedAt: now() })
          .where(eq(campaigns.id, id))
          .returning();
        const updated = row ? await loadCampaign(db, row.id) : null;
        return { started: true, problems: [], campaign: updated };
      },
      async pause(id) {
        const [row] = await db
          .update(campaigns)
          .set({ status: "paused", updatedAt: now() })
          .where(eq(campaigns.id, id))
          .returning();
        return row ? loadCampaign(db, row.id) : null;
      },
      async stats(id) {
        const campaign = await loadCampaign(db, id);
        if (!campaign) return null;
        return campaignStats(db, campaign);
      },
    },
    enrollments: {
      async enroll(campaignId, input) {
        const campaign = await loadCampaign(db, campaignId);
        if (!campaign) return null;
        const ids = new Set(input.contact_ids ?? []);
        if (input.list_id) {
          const rows = await db
            .select({ contactId: listMembers.contactId })
            .from(listMembers)
            .where(eq(listMembers.listId, input.list_id));
          if (rows.length === 0) {
            const [list] = await db.select({ id: lists.id }).from(lists).where(eq(lists.id, input.list_id)).limit(1);
            if (!list) throw new ApiError(404, "not_found", "List not found.");
          }
          for (const row of rows) ids.add(row.contactId);
        }
        let enrolled = 0;
        for (const contactId of ids) {
          const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
          if (!contact || contact.status !== "active") continue;
          if (await suppressed(db, contact.email)) continue;
          const inserted = await db
            .insert(enrollments)
            .values({ campaignId, contactId, currentStep: 1, nextSendAt: now(), status: "active" })
            .onConflictDoNothing()
            .returning({ id: enrollments.id });
          enrolled += inserted.length;
        }
        return { enrolled };
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

async function suppressed(db: AppDatabase, email: string): Promise<boolean> {
  const domain = email.split("@")[1] ?? "";
  const rows = await db
    .select({ id: suppressions.id })
    .from(suppressions)
    .where(
      or(
        and(eq(suppressions.kind, "email"), eq(suppressions.value, email)),
        and(eq(suppressions.kind, "domain"), eq(suppressions.value, domain)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

function contactValues(input: ContactInput) {
  return {
    email: input.email,
    firstName: input.first_name ?? "",
    lastName: input.last_name ?? "",
    company: input.company ?? "",
    title: input.title ?? "",
    customFields: input.custom_fields ?? {},
    status: "active" as const,
  };
}

function toContact(row: typeof contacts.$inferSelect): Contact {
  const status = CONTACT_STATUSES.includes(row.status as ContactStatus) ? (row.status as ContactStatus) : "active";
  const custom: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.customFields ?? {})) {
    if (typeof value === "string") custom[key] = value;
  }
  return {
    id: row.id,
    email: row.email,
    first_name: row.firstName || null,
    last_name: row.lastName || null,
    company: row.company || null,
    title: row.title || null,
    custom_fields: custom,
    status,
  };
}

function toStep(row: typeof campaignSteps.$inferSelect) {
  return {
    id: row.id,
    position: row.position,
    subject: row.subject ?? "",
    body: row.body,
    delay_days: row.delayDays,
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

async function loadCampaign(db: AppDatabase, id: string): Promise<Campaign | null> {
  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!row) return null;
  const steps = await db.select().from(campaignSteps).where(eq(campaignSteps.campaignId, id)).orderBy(campaignSteps.position);
  const boxes = await db.select({ mailboxId: campaignMailboxes.mailboxId }).from(campaignMailboxes).where(eq(campaignMailboxes.campaignId, id));
  const status = row.status === "running" || row.status === "paused" || row.status === "completed" ? row.status : "draft";
  return { id: row.id, name: row.name, status, mailbox_ids: boxes.map((box) => box.mailboxId), steps: steps.map(toStep) };
}

async function replaceMailboxes(db: AppDatabase, campaignId: string, mailboxIds: string[]): Promise<void> {
  if (mailboxIds.length > 0) {
    const found = await db.select({ id: mailboxes.id }).from(mailboxes).where(inArray(mailboxes.id, mailboxIds));
    if (found.length !== new Set(mailboxIds).size) throw new ApiError(400, "validation_error", "A mailbox id does not exist.");
  }
  await db.delete(campaignMailboxes).where(eq(campaignMailboxes.campaignId, campaignId));
  if (mailboxIds.length === 0) return;
  await db.insert(campaignMailboxes).values(mailboxIds.map((mailboxId) => ({ campaignId, mailboxId })));
}

async function launchProblems(db: AppDatabase, campaign: Campaign): Promise<string[]> {
  const problems: string[] = [];
  if (campaign.steps.length === 0 || campaign.steps.some((step) => step.body.trim().length === 0)) {
    problems.push("A step is empty.");
  }
  if (campaign.mailbox_ids.length === 0) problems.push("No mailboxes.");
  if (campaign.mailbox_ids.length > 0) {
    const rows = await db.select({ health: mailboxes.health }).from(mailboxes).where(inArray(mailboxes.id, campaign.mailbox_ids));
    if (rows.some((row) => row.health === "paused")) problems.push("A mailbox is paused.");
  }
  const enrolled = await db
    .select({ status: contacts.status, email: contacts.email })
    .from(enrollments)
    .innerJoin(contacts, eq(enrollments.contactId, contacts.id))
    .where(and(eq(enrollments.campaignId, campaign.id), eq(enrollments.status, "active")));
  if (enrolled.length === 0) {
    problems.push("No contacts are enrolled.");
  } else {
    const usable: typeof enrolled = [];
    for (const contact of enrolled) {
      if (contact.status === "active" && !(await suppressed(db, contact.email))) usable.push(contact);
    }
    if (usable.length === 0) problems.push("Contacts are all suppressed.");
  }
  return problems;
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

async function listCount(db: AppDatabase, listId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(listMembers).where(eq(listMembers.listId, listId));
  return numberOf(row?.n);
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

function numberOf(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
