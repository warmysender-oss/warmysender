import type { Interest } from "./interest.js";

export interface ThreadMessage {
  id: string;
  mailboxId: string;
  contactId: string | null;
  at: string;
  direction: "in" | "out";
  subject: string;
  from: string;
  bodyText: string;
  kind: "sent" | "reply" | "auto_reply" | "bounce" | "delivery_delay" | "unmatched";
  messageId: string | null;
  interest: Interest | null;
}

export interface Thread {
  key: string;
  mailboxId: string;
  contactId: string | null;
  subject: string;
  latestAt: string;
  messages: ThreadMessage[];
  badge: "reply" | "auto-reply" | "bounce" | "delay" | "unmatched" | "sent";
  interest: Interest | null;
}

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function badgeFor(messages: readonly ThreadMessage[]): Thread["badge"] {
  const kinds = new Set(messages.map((message) => message.kind));
  if (kinds.has("bounce")) return "bounce";
  if (kinds.has("reply")) return "reply";
  if (kinds.has("auto_reply")) return "auto-reply";
  if (kinds.has("delivery_delay")) return "delay";
  if (kinds.has("unmatched")) return "unmatched";
  return "sent";
}

export function buildThreads(messages: readonly ThreadMessage[]): Thread[] {
  const groups = new Map<string, ThreadMessage[]>();
  for (const message of messages) {
    const key = message.contactId ? `${message.mailboxId}:${message.contactId}` : `lone:${message.id}`;
    const list = groups.get(key) ?? [];
    list.push(message);
    groups.set(key, list);
  }
  const threads: Thread[] = [];
  for (const [key, grouped] of groups) {
    const ordered = [...grouped].sort((a, b) => time(a.at) - time(b.at));
    const latest = ordered[ordered.length - 1];
    if (!latest) continue;
    const latestReply = [...ordered].reverse().find((message) => message.kind === "reply");
    const interest = latestReply?.interest ?? null;
    threads.push({
      key,
      mailboxId: latest.mailboxId,
      contactId: latest.contactId,
      subject: latest.subject,
      latestAt: latest.at,
      messages: ordered,
      badge: badgeFor(ordered),
      interest,
    });
  }
  threads.sort((a, b) => time(b.latestAt) - time(a.latestAt));
  return threads;
}

function normalizeMessageId(raw: string): string {
  let value = raw.trim();
  if (value.startsWith("<") && value.endsWith(">") && value.indexOf("<", 1) === -1) {
    value = value.slice(1, -1).trim();
  }
  return value.toLowerCase();
}

export function replySubject(subject: string): string {
  const trimmed = subject.trim();
  if (/^re\s*:/i.test(trimmed)) return trimmed;
  return trimmed ? `Re: ${trimmed}` : "Re:";
}

export interface ThreadReply {
  mailboxId: string;
  from: string;
  to: string;
  subject: string;
  inReplyTo: string;
  references: string;
  bodyText: string;
}

/**
 * Headers for a human reply sent from the same mailbox that owns the thread.
 * In-Reply-To is the latest message that has a Message-ID.
 * References lists every Message-ID in the thread, in order.
 */
export function buildThreadReply(input: {
  mailboxId: string;
  mailboxEmail: string;
  contactEmail: string;
  messages: readonly Pick<ThreadMessage, "messageId" | "subject" | "at" | "direction">[];
  bodyText: string;
}): ThreadReply {
  const bodyText = input.bodyText.trim();
  if (!bodyText) throw new Error("Reply body is empty");
  const ordered = [...input.messages].sort((a, b) => time(a.at) - time(b.at));
  const withIds = ordered.filter((message) => message.messageId && message.messageId.trim());
  const parent = withIds[withIds.length - 1];
  if (!parent?.messageId) throw new Error("Thread has no Message-ID to reply to");
  const seen = new Set<string>();
  const references: string[] = [];
  for (const message of withIds) {
    const id = normalizeMessageId(message.messageId ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    references.push(`<${id}>`);
  }
  const latest = ordered[ordered.length - 1] ?? parent;
  return {
    mailboxId: input.mailboxId,
    from: input.mailboxEmail,
    to: input.contactEmail,
    subject: replySubject(latest.subject),
    inReplyTo: `<${normalizeMessageId(parent.messageId)}>`,
    references: references.join(" "),
    bodyText,
  };
}
