import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Full v1 database schema.
 * Add columns in a new migration. Never edit a migration that already shipped.
 *
 * Safety limits that later tasks enforce in code (not overridable by an agent):
 * mailbox daily cap default 30, hard max 50.
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull().default(""),
    role: text("role").notNull().default("member"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    check("users_role_chk", sql`${t.role} in ('admin', 'member')`),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    email: text("email"),
    role: text("role").notNull().default("member"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invites_token_hash_unique").on(t.tokenHash),
    index("invites_email_idx").on(t.email),
    check("invites_role_chk", sql`${t.role} in ('admin', 'member')`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("api_keys_key_hash_unique").on(t.keyHash),
    index("api_keys_created_by_idx").on(t.createdBy),
  ],
);

/** Singleton row id = 'default'. Holds the optional WarmySender API key, encrypted. */
export const settings = pgTable(
  "settings",
  {
    id: text("id").primaryKey().default("default"),
    warmysenderApiKeyEncrypted: text("warmysender_api_key_encrypted"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("settings_singleton_chk", sql`${t.id} = 'default'`)],
);

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromName: text("from_name").notNull().default(""),
    email: text("email").notNull(),
    /** smtp preset or 'microsoft'. */
    provider: text("provider").notNull().default("custom"),
    smtpHost: text("smtp_host").notNull().default(""),
    smtpPort: integer("smtp_port").notNull().default(587),
    /** 'starttls' | 'ssl' | 'none' */
    smtpSecurity: text("smtp_security").notNull().default("starttls"),
    smtpUsername: text("smtp_username").notNull().default(""),
    smtpPasswordEncrypted: text("smtp_password_encrypted"),
    imapHost: text("imap_host").notNull().default(""),
    imapPort: integer("imap_port").notNull().default(993),
    imapSecurity: text("imap_security").notNull().default("ssl"),
    imapUsername: text("imap_username").notNull().default(""),
    imapPasswordEncrypted: text("imap_password_encrypted"),
    oauthRefreshTokenEncrypted: text("oauth_refresh_token_encrypted"),
    oauthAccessTokenEncrypted: text("oauth_access_token_encrypted"),
    oauthAccessTokenExpiresAt: timestamp("oauth_access_token_expires_at", { withTimezone: true }),
    /** ISO weekdays 1 (Mon) through 7 (Sun). */
    sendingDays: smallint("sending_days")
      .array()
      .notNull()
      .default(sql`ARRAY[1,2,3,4,5]::smallint[]`),
    windowStart: text("window_start").notNull().default("09:00"),
    windowEnd: text("window_end").notNull().default("17:00"),
    timezone: text("timezone").notNull().default("UTC"),
    gapMinMinutes: integer("gap_min_minutes").notNull().default(4),
    gapMaxMinutes: integer("gap_max_minutes").notNull().default(9),
    /** Hard max 50. The sending engine refuses anything above this. */
    dailyCap: integer("daily_cap").notNull().default(30),
    signature: text("signature").notNull().default(""),
    rampStartedOn: date("ramp_started_on", { mode: "string" }).notNull().default(sql`current_date`),
    /** 'unknown' | 'healthy' | 'paused' */
    health: text("health").notNull().default("unknown"),
    pausedReason: text("paused_reason"),
    consecutiveAuthFailures: integer("consecutive_auth_failures").notNull().default(0),
    /** SMTP 5.7.x policy blocks. A success resets this. It does not bounce the contact. */
    consecutivePolicyFailures: integer("consecutive_policy_failures").notNull().default(0),
    /**
     * Set while a worker owns this mailbox for a tick.
     * Another worker skips the row until this time. A crash releases it when the time passes.
     */
    sendClaimUntil: timestamp("send_claim_until", { withTimezone: true }),
    lastSendAt: timestamp("last_send_at", { withTimezone: true }),
    /** Minutes chosen after the last successful send. Null until the mailbox has sent. */
    nextGapMinutes: integer("next_gap_minutes"),
    imapUidValidity: integer("imap_uid_validity"),
    lastSeenImapUid: integer("last_seen_imap_uid"),
    warmysenderMailboxId: text("warmysender_mailbox_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("mailboxes_email_unique").on(t.email),
    index("mailboxes_health_idx").on(t.health),
    check("mailboxes_daily_cap_chk", sql`${t.dailyCap} >= 1 and ${t.dailyCap} <= 50`),
    check(
      "mailboxes_gap_chk",
      sql`${t.gapMinMinutes} >= 1 and ${t.gapMaxMinutes} >= ${t.gapMinMinutes} and ${t.gapMaxMinutes} <= 1440`,
    ),
    check(
      "mailboxes_next_gap_chk",
      sql`${t.nextGapMinutes} is null or (${t.nextGapMinutes} >= 1 and ${t.nextGapMinutes} <= 1440)`,
    ),
    check("mailboxes_health_chk", sql`${t.health} in ('unknown', 'healthy', 'paused')`),
    check("mailboxes_policy_failures_chk", sql`${t.consecutivePolicyFailures} >= 0`),
    check("mailboxes_smtp_security_chk", sql`${t.smtpSecurity} in ('starttls', 'ssl', 'none')`),
    check("mailboxes_imap_security_chk", sql`${t.imapSecurity} in ('starttls', 'ssl', 'none')`),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    company: text("company").notNull().default(""),
    title: text("title").notNull().default(""),
    customFields: jsonb("custom_fields")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** active | replied | bounced | unsubscribed | invalid | risky */
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("contacts_email_unique").on(t.email),
    index("contacts_status_idx").on(t.status),
    check(
      "contacts_status_chk",
      sql`${t.status} in ('active', 'replied', 'bounced', 'unsubscribed', 'invalid', 'risky')`,
    ),
  ],
);

export const lists = pgTable("lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ...timestamps,
});

export const listMembers = pgTable(
  "list_members",
  {
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.listId, t.contactId] })],
);

export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'email' | 'domain' */
    kind: text("kind").notNull(),
    value: text("value").notNull(),
    reason: text("reason").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("suppressions_kind_value_unique").on(t.kind, t.value),
    check("suppressions_kind_chk", sql`${t.kind} in ('email', 'domain')`),
  ],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** draft | running | paused | completed */
    status: text("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("campaigns_status_idx").on(t.status),
    check("campaigns_status_chk", sql`${t.status} in ('draft', 'running', 'paused', 'completed')`),
  ],
);

export const campaignSteps = pgTable(
  "campaign_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** Null on a follow-up means "keep the previous subject and prefix Re:". */
    subject: text("subject"),
    body: text("body").notNull().default(""),
    delayDays: integer("delay_days").notNull().default(0),
    isHtml: boolean("is_html").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("campaign_steps_position_unique").on(t.campaignId, t.position),
    check("campaign_steps_position_chk", sql`${t.position} >= 1`),
    check("campaign_steps_delay_chk", sql`${t.delayDays} >= 0`),
  ],
);

/** Draft audience. Enrollments are created from these rows when the campaign starts. */
export const campaignAudienceContacts = pgTable(
  "campaign_audience_contacts",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.contactId] })],
);

export const campaignAudienceLists = pgTable(
  "campaign_audience_lists",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    listId: uuid("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.listId] })],
);

export const campaignMailboxes = pgTable(
  "campaign_mailboxes",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.mailboxId] })],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    /** Next step number to send. 1-based. */
    currentStep: integer("current_step").notNull().default(1),
    nextSendAt: timestamp("next_send_at", { withTimezone: true }),
    /** Set when step 1 is sent. The contact stays on this mailbox. */
    mailboxId: uuid("mailbox_id").references(() => mailboxes.id, { onDelete: "set null" }),
    /** active | completed | stopped */
    status: text("status").notNull().default("active"),
    /** reply | bounce | unsubscribe | suppressed | contact_inactive | null */
    stopReason: text("stop_reason"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("enrollments_campaign_contact_unique").on(t.campaignId, t.contactId),
    index("enrollments_contact_idx").on(t.contactId),
    index("enrollments_mailbox_idx").on(t.mailboxId),
    /** Scheduler: due enrollments, one index scan. */
    index("enrollments_due_idx")
      .on(t.nextSendAt)
      .where(sql`${t.status} = 'active'`),
    check("enrollments_step_chk", sql`${t.currentStep} >= 1`),
    check("enrollments_status_chk", sql`${t.status} in ('active', 'completed', 'stopped')`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    stepId: uuid("step_id").references(() => campaignSteps.id, { onDelete: "set null" }),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "restrict" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    /** RFC 5322 Message-ID, used to match replies. */
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    referencesHeader: text("references"),
    subject: text("subject").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    bodyHtml: text("body_html"),
    /** pending | sent | failed */
    status: text("status").notNull().default("pending"),
    error: text("error"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    /** Set when SMTP starts. A pending row with this set and no next_attempt_at is in flight. */
    sendStartedAt: timestamp("send_started_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("messages_message_id_unique").on(t.messageId),
    /** One row per step so a restart updates the in-flight send instead of inserting another. */
    uniqueIndex("messages_enrollment_step_unique").on(t.enrollmentId, t.stepId),
    index("messages_enrollment_idx").on(t.enrollmentId),
    index("messages_contact_idx").on(t.contactId),
    /** Daily cap and gap: sent rows for a mailbox, newest first in the planner. */
    index("messages_mailbox_sent_idx")
      .on(t.mailboxId, t.sentAt)
      .where(sql`${t.status} = 'sent'`),
    check("messages_status_chk", sql`${t.status} in ('pending', 'sent', 'failed')`),
  ],
);

export const inboundMessages = pgTable(
  "inbound_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "restrict" }),
    imapUid: integer("imap_uid").notNull(),
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    referencesHeader: text("references"),
    fromEmail: text("from_email").notNull(),
    subject: text("subject").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    bodyHtml: text("body_html"),
    /** reply | auto_reply | bounce | other */
    kind: text("kind").notNull(),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    matchedMessageId: uuid("matched_message_id").references(() => messages.id, { onDelete: "set null" }),
    /** unknown | interested | not_interested */
    interest: text("interest").notNull().default("unknown"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inbound_mailbox_uid_unique").on(t.mailboxId, t.imapUid),
    index("inbound_in_reply_to_idx").on(t.inReplyTo),
    index("inbound_from_email_idx").on(t.fromEmail),
    index("inbound_enrollment_idx").on(t.enrollmentId),
    check("inbound_kind_chk", sql`${t.kind} in ('reply', 'auto_reply', 'bounce', 'other')`),
    check("inbound_interest_chk", sql`${t.interest} in ('unknown', 'interested', 'not_interested')`),
  ],
);

export const replyDrafts = pgTable(
  "reply_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inboundMessageId: uuid("inbound_message_id").references(() => inboundMessages.id, {
      onDelete: "cascade",
    }),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id, { onDelete: "set null" }),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    /** draft | sent | discarded */
    status: text("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    sentMessageId: text("sent_message_id"),
    ...timestamps,
  },
  (t) => [
    index("reply_drafts_inbound_idx").on(t.inboundMessageId),
    check("reply_drafts_status_chk", sql`${t.status} in ('draft', 'sent', 'discarded')`),
  ],
);

export const unsubscribeTokens = pgTable(
  "unsubscribe_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    enrollmentId: uuid("enrollment_id").references(() => enrollments.id, { onDelete: "set null" }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("unsubscribe_tokens_hash_unique").on(t.tokenHash)],
);

/** User actions (category audit) and worker decisions (category job), including the heartbeat. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'audit' | 'job' */
    category: text("category").notNull(),
    /** user | api_key | system | worker */
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_created_idx").on(t.createdAt),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_category_created_idx").on(t.category, t.createdAt),
    check("audit_log_category_chk", sql`${t.category} in ('audit', 'job')`),
    check("audit_log_actor_chk", sql`${t.actorType} in ('user', 'api_key', 'system', 'worker')`),
  ],
);

export type User = typeof users.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type Session = typeof sessions.$inferSelect;

export const databaseSchema = {
  users,
  invites,
  sessions,
  apiKeys,
  settings,
  mailboxes,
  contacts,
  lists,
  listMembers,
  suppressions,
  campaigns,
  campaignSteps,
  campaignMailboxes,
  campaignAudienceContacts,
  campaignAudienceLists,
  enrollments,
  messages,
  inboundMessages,
  replyDrafts,
  unsubscribeTokens,
  auditLog,
};
