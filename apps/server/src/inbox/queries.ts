import { eq } from "drizzle-orm";
import {
  contacts,
  inboundMessages,
  mailboxes,
  messages,
  replyDrafts,
  type AppDatabase,
} from "@warmysender/core";
import { buildThreads, type Thread, type ThreadMessage } from "./thread-reply.js";

function interestOf(value: string): ThreadMessage["interest"] {
  if (value === "interested" || value === "not_interested") return value;
  return null;
}

function inboundKind(kind: string): ThreadMessage["kind"] {
  if (kind === "reply" || kind === "auto_reply" || kind === "bounce") return kind;
  return "unmatched";
}

export async function listInboxThreads(db: AppDatabase): Promise<Thread[]> {
  const inbound = await db.select().from(inboundMessages);
  const outbound = await db
    .select({
      id: messages.id,
      mailboxId: messages.mailboxId,
      contactId: messages.contactId,
      subject: messages.subject,
      bodyText: messages.bodyText,
      messageId: messages.messageId,
      sentAt: messages.sentAt,
      createdAt: messages.createdAt,
      status: messages.status,
      fromEmail: mailboxes.email,
    })
    .from(messages)
    .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id));
  const drafts = await db
    .select({
      id: replyDrafts.id,
      mailboxId: replyDrafts.mailboxId,
      body: replyDrafts.body,
      status: replyDrafts.status,
      sentMessageId: replyDrafts.sentMessageId,
      createdAt: replyDrafts.createdAt,
      contactId: inboundMessages.contactId,
      subject: inboundMessages.subject,
      fromEmail: mailboxes.email,
    })
    .from(replyDrafts)
    .innerJoin(mailboxes, eq(replyDrafts.mailboxId, mailboxes.id))
    .leftJoin(inboundMessages, eq(replyDrafts.inboundMessageId, inboundMessages.id));

  const threadMessages: ThreadMessage[] = [];
  for (const row of inbound) {
    threadMessages.push({
      id: row.id,
      mailboxId: row.mailboxId,
      contactId: row.contactId,
      at: row.receivedAt.toISOString(),
      direction: "in",
      subject: row.subject,
      from: row.fromEmail,
      bodyText: row.bodyText,
      kind: inboundKind(row.kind),
      messageId: row.messageId,
      interest: interestOf(row.interest),
    });
  }
  for (const row of outbound) {
    if (row.status !== "sent") continue;
    threadMessages.push({
      id: row.id,
      mailboxId: row.mailboxId,
      contactId: row.contactId,
      at: (row.sentAt ?? row.createdAt).toISOString(),
      direction: "out",
      subject: row.subject,
      from: row.fromEmail,
      bodyText: row.bodyText,
      kind: "sent",
      messageId: row.messageId,
      interest: null,
    });
  }
  for (const row of drafts) {
    if (row.status !== "sent") continue;
    threadMessages.push({
      id: row.id,
      mailboxId: row.mailboxId,
      contactId: row.contactId,
      at: row.createdAt.toISOString(),
      direction: "out",
      subject: row.subject ? `Re: ${row.subject}` : "Re:",
      from: row.fromEmail,
      bodyText: row.body,
      kind: "sent",
      messageId: row.sentMessageId,
      interest: null,
    });
  }
  return buildThreads(threadMessages);
}

export async function findInbound(db: AppDatabase, id: string) {
  const rows = await db.select().from(inboundMessages).where(eq(inboundMessages.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findContact(db: AppDatabase, id: string) {
  const rows = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findMailbox(db: AppDatabase, id: string) {
  const rows = await db.select().from(mailboxes).where(eq(mailboxes.id, id)).limit(1);
  return rows[0] ?? null;
}
