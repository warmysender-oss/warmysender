import { extractEmail, extractMessageIds, normalizeSubject } from "./codec.js";
import type { InboundMail, ReplyMatch, SentMessageRef } from "./types.js";

function indexSent(sent: readonly SentMessageRef[]): Map<string, SentMessageRef> {
  const byId = new Map<string, SentMessageRef>();
  for (const message of sent) {
    for (const id of extractMessageIds(message.messageId)) {
      if (!byId.has(id)) byId.set(id, message);
    }
  }
  return byId;
}

function sentTime(message: SentMessageRef): number {
  const parsed = Date.parse(message.sentAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Match order from spec §3.6: In-Reply-To, then References, then sender address + subject.
 * In-Reply-To uses the first id that we sent. References uses the closest (last) id that we sent.
 */
export function matchReply(mail: Pick<InboundMail, "from" | "subject" | "inReplyTo" | "references">, sent: readonly SentMessageRef[]): ReplyMatch | null {
  const byId = indexSent(sent);
  for (const id of extractMessageIds(mail.inReplyTo)) {
    const hit = byId.get(id);
    if (hit) return { method: "in_reply_to", sent: hit };
  }
  const references = extractMessageIds(mail.references);
  for (let index = references.length - 1; index >= 0; index -= 1) {
    const hit = byId.get(references[index] ?? "");
    if (hit) return { method: "references", sent: hit };
  }
  const sender = extractEmail(mail.from);
  const subject = normalizeSubject(mail.subject);
  if (!sender || !subject) return null;
  const candidates = sent.filter(
    (message) => message.contactEmail.toLowerCase() === sender && normalizeSubject(message.subject) === subject,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => sentTime(b) - sentTime(a));
  const latest = candidates[0];
  if (!latest) return null;
  return { method: "sender_subject", sent: latest };
}
