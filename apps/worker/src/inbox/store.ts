import { and, eq } from "drizzle-orm";
import {
  contacts,
  enrollments,
  inboundMessages,
  mailboxes,
  messages,
  suppressions,
  type AppDatabase,
} from "@warmysender/core";
import { extractEmail } from "./codec.js";
import { storedKind } from "./decide.js";
import type { CommitEvent, InboxPollStore, MailboxPollState } from "./poll.js";
import type { InboundMail, SentMessageRef } from "./types.js";

function receivedAt(mail: InboundMail): Date {
  const raw = mail.headers.date;
  if (!raw) return new Date();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function fromEmail(mail: InboundMail): string {
  return extractEmail(mail.from) ?? (mail.from.trim().slice(0, 320) || "unknown");
}

/** Applies one classified message. A UID that is already stored is left unchanged. */
export async function applyInboundCommit(db: AppDatabase, mailboxId: string, event: CommitEvent): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: inboundMessages.id })
      .from(inboundMessages)
      .where(and(eq(inboundMessages.mailboxId, mailboxId), eq(inboundMessages.imapUid, event.uid)))
      .limit(1);
    if (existing.length > 0) {
      await tx
        .update(mailboxes)
        .set({ lastSeenImapUid: event.lastSeenUid, consecutiveAuthFailures: 0, updatedAt: new Date() })
        .where(eq(mailboxes.id, mailboxId));
      return;
    }

    const match = event.decision.match?.sent;
    const contactId = event.decision.contactEffects[0]?.contactId ?? match?.contactId ?? null;
    await tx.insert(inboundMessages).values({
      mailboxId,
      imapUid: event.uid,
      messageId: event.mail.messageId,
      inReplyTo: event.mail.inReplyTo,
      referencesHeader: event.mail.references,
      fromEmail: fromEmail(event.mail),
      subject: event.mail.subject,
      bodyText: event.mail.text,
      kind: storedKind(event.decision.kind),
      enrollmentId: match?.enrollmentId ?? null,
      contactId,
      matchedMessageId: match?.id ?? null,
      interest: "unknown",
      receivedAt: receivedAt(event.mail),
    });

    for (const effect of event.plan) {
      if (effect.op === "set_contact_status") {
        await tx
          .update(contacts)
          .set({ status: effect.status, updatedAt: new Date() })
          .where(eq(contacts.id, effect.contactId));
      } else if (effect.op === "stop_enrollments") {
        await tx
          .update(enrollments)
          .set({ status: "stopped", stopReason: effect.reason, updatedAt: new Date() })
          .where(and(eq(enrollments.contactId, effect.contactId), eq(enrollments.status, "active")));
      } else if (effect.op === "suppress_email") {
        await tx
          .insert(suppressions)
          .values({ kind: "email", value: effect.email, reason: "bounce" })
          .onConflictDoNothing({ target: [suppressions.kind, suppressions.value] });
      }
    }

    await tx
      .update(mailboxes)
      .set({ lastSeenImapUid: event.lastSeenUid, consecutiveAuthFailures: 0, updatedAt: new Date() })
      .where(eq(mailboxes.id, mailboxId));
  });
}

export function createInboxPollStore(db: AppDatabase, uidValidity: number | null): InboxPollStore {
  return {
    async isUidStored(mailboxId, uid) {
      const rows = await db
        .select({ id: inboundMessages.id })
        .from(inboundMessages)
        .where(and(eq(inboundMessages.mailboxId, mailboxId), eq(inboundMessages.imapUid, uid)))
        .limit(1);
      return rows.length > 0;
    },
    async commit(mailboxId, event) {
      await applyInboundCommit(db, mailboxId, event);
    },
    async saveState(mailboxId, state) {
      await saveMailboxPollState(db, mailboxId, state, uidValidity);
    },
  };
}

export async function saveMailboxPollState(
  db: AppDatabase,
  mailboxId: string,
  state: MailboxPollState,
  uidValidity: number | null,
): Promise<void> {
  await db
    .update(mailboxes)
    .set({
      lastSeenImapUid: state.lastSeenUid,
      consecutiveAuthFailures: state.consecutiveAuthFailures,
      imapUidValidity: uidValidity,
      health: state.paused ? "paused" : "healthy",
      pausedReason: state.pauseReason,
      updatedAt: new Date(),
    })
    .where(eq(mailboxes.id, mailboxId));
}

export async function loadSentMessages(db: AppDatabase): Promise<SentMessageRef[]> {
  const rows = await db
    .select({
      id: messages.id,
      messageId: messages.messageId,
      contactId: messages.contactId,
      contactEmail: contacts.email,
      enrollmentId: messages.enrollmentId,
      campaignId: messages.campaignId,
      stepId: messages.stepId,
      mailboxId: messages.mailboxId,
      subject: messages.subject,
      sentAt: messages.sentAt,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(contacts, eq(messages.contactId, contacts.id))
    .where(eq(messages.status, "sent"));
  const sent: SentMessageRef[] = [];
  for (const row of rows) {
    if (!row.messageId) continue;
    sent.push({
      id: row.id,
      messageId: row.messageId,
      contactId: row.contactId,
      contactEmail: row.contactEmail,
      enrollmentId: row.enrollmentId,
      campaignId: row.campaignId,
      stepId: row.stepId ?? "",
      mailboxId: row.mailboxId,
      subject: row.subject,
      sentAt: (row.sentAt ?? row.createdAt).toISOString(),
    });
  }
  return sent;
}
