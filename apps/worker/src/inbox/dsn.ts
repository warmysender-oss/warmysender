import { extractEmail, extractMessageIds } from "./codec.js";
import type { DeliveryRecipient, InboundMail, SentMessageRef } from "./types.js";

const BOUNCE_LOCAL_PARTS = new Set(["mailer-daemon", "mailerdaemon", "postmaster"]);

const BOUNCE_SUBJECTS: Array<{ id: string; pattern: RegExp }> = [
  { id: "delivery-status-notification", pattern: /delivery status notification/i },
  { id: "undeliverable", pattern: /undeliverable/i },
  { id: "undelivered", pattern: /undelivered mail/i },
  { id: "mail-delivery-failed", pattern: /mail delivery failed/i },
  { id: "delivery-failure", pattern: /delivery failure/i },
  { id: "failure-notice", pattern: /failure notice/i },
  { id: "returned-mail", pattern: /returned mail/i },
];

export interface BounceAnalysis {
  signals: string[];
  /** Permanent failures. These addresses are suppressed. */
  permanentEmails: string[];
  /** 4xx / Action: delayed. These do not suppress and do not stop a sequence. */
  delayedEmails: string[];
  /** Sent messages tied to a permanent failure, via recipient address or original Message-ID. */
  contacts: SentMessageRef[];
  /** Sent message whose Message-ID was copied inside the DSN. */
  original: SentMessageRef | null;
  delayOnly: boolean;
}

export function isBounceSender(from: string): boolean {
  const email = extractEmail(from);
  if (!email) return false;
  const local = email.split("@")[0] ?? "";
  return BOUNCE_LOCAL_PARTS.has(local);
}

function subjectSignal(subject: string): string | null {
  for (const candidate of BOUNCE_SUBJECTS) {
    if (candidate.pattern.test(subject)) return candidate.id;
  }
  return null;
}

function recipientAddress(recipient: DeliveryRecipient): string | null {
  const finalEmail = addressFromRecipientField(recipient.finalRecipient);
  if (finalEmail) return finalEmail;
  return addressFromRecipientField(recipient.originalRecipient);
}

function addressFromRecipientField(value: string | null): string | null {
  if (!value) return null;
  const withoutType = value.replace(/^\s*[a-z0-9-]+\s*;\s*/i, "");
  return extractEmail(withoutType);
}

export function isPermanentFailure(action: string | null, status: string | null): boolean {
  const normalizedAction = action?.trim().toLowerCase() ?? "";
  if (normalizedAction === "delayed" || normalizedAction === "delivered" || normalizedAction === "relayed" || normalizedAction === "expanded") {
    return false;
  }
  if (normalizedAction === "failed") return true;
  return statusClass(status) === 5;
}

export function isDelay(action: string | null, status: string | null): boolean {
  if (isPermanentFailure(action, status)) return false;
  const normalizedAction = action?.trim().toLowerCase() ?? "";
  if (normalizedAction === "delayed") return true;
  return statusClass(status) === 4;
}

function statusClass(status: string | null): 4 | 5 | null {
  if (!status) return null;
  const token = status.trim().match(/\b([45])(?:\.\d+){1,2}\b|\b([45])\d\d\b/);
  const digit = token?.[1] ?? token?.[2];
  if (digit === "5") return 5;
  if (digit === "4") return 4;
  return null;
}

function narrativeBeforeOriginal(text: string): string {
  const lines = text.split("\n");
  const cut = lines.findIndex((line) => {
    const trimmed = line.trim();
    return /original message/i.test(trimmed) || /below this line/i.test(trimmed) || /^-{3,}/.test(trimmed);
  });
  return (cut === -1 ? lines : lines.slice(0, cut)).join("\n");
}

/** Plain-text DSN bodies (Postfix and similar) that are not multipart/report. */
export function recipientsFromPlainText(text: string): DeliveryRecipient[] {
  const narrative = narrativeBeforeOriginal(text);
  const fromFields = fieldRecipients(narrative);
  if (fromFields.length > 0) return fromFields;
  const found: DeliveryRecipient[] = [];
  const seen = new Set<string>();
  const pattern = /<([^<>\s]+@[^<>\s]+)>/g;
  for (const match of narrative.matchAll(pattern)) {
    const email = extractEmail(match[1] ?? "");
    if (!email || seen.has(email)) continue;
    const window = narrative.slice(match.index ?? 0, (match.index ?? 0) + 400);
    const status = window.match(/\b([45]\.\d+\.\d+|[45]\d\d)\b/);
    const code = status?.[1] ?? null;
    const failed = code !== null && (code.startsWith("5") || /^5\d\d$/.test(code));
    const delayed = code !== null && !failed && (code.startsWith("4") || /^4\d\d$/.test(code));
    if (!failed && !delayed) continue;
    seen.add(email);
    found.push({
      finalRecipient: `rfc822; ${email}`,
      originalRecipient: null,
      action: failed ? "failed" : "delayed",
      status: code,
      diagnosticCode: window.replace(/\s+/g, " ").trim(),
    });
  }
  return found;
}

function fieldRecipients(text: string): DeliveryRecipient[] {
  const recipients: DeliveryRecipient[] = [];
  for (const chunk of text.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").filter((line) => /^[a-z-]+:/i.test(line.trim()));
    if (lines.length === 0) continue;
    const map = new Map<string, string>();
    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon === -1) continue;
      map.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
    }
    const finalRecipient = map.get("final-recipient") ?? null;
    const originalRecipient = map.get("original-recipient") ?? null;
    const action = map.get("action") ?? null;
    const status = map.get("status") ?? null;
    if (!finalRecipient && !originalRecipient) continue;
    recipients.push({
      finalRecipient,
      originalRecipient,
      action,
      status,
      diagnosticCode: map.get("diagnostic-code") ?? null,
    });
  }
  return recipients;
}

function subjectLooksLikeDelay(subject: string): boolean {
  return /delay/i.test(subject) && !/fail|undeliver/i.test(subject);
}

export function analyzeBounce(mail: InboundMail, sent: readonly SentMessageRef[]): BounceAnalysis | null {
  const signals: string[] = [];
  const senderIsDaemon = isBounceSender(mail.from);
  if (senderIsDaemon) signals.push("from");
  const subject = subjectSignal(mail.subject);
  if (subject) signals.push(`subject:${subject}`);
  const reportType = mail.headers["content-type"] ?? "";
  const isReport =
    (/multipart\/report/i.test(reportType) && /report-type\s*=\s*"?delivery-status/i.test(reportType)) ||
    mail.contentType === "multipart/report";
  if (isReport) signals.push("multipart/report");
  const structured = mail.recipients;
  if (structured.length > 0) signals.push("delivery-status");

  const scanPlain = structured.length === 0 && (senderIsDaemon || subject !== null || isReport);
  const plain = scanPlain ? recipientsFromPlainText(mail.text) : [];
  const hasRecipientEvidence = structured.length > 0 || plain.length > 0;
  // A mailer-daemon/postmaster From with an ordinary subject is not a bounce on its own.
  // Real DSNs also carry a failure subject, multipart/report, or recipient diagnostics.
  if (!isReport && !subject && !hasRecipientEvidence) return null;

  const parsed = structured.length > 0 ? structured : plain;
  const permanentEmails: string[] = [];
  const delayedEmails: string[] = [];
  for (const recipient of parsed) {
    const email = recipientAddress(recipient);
    if (!email) continue;
    if (isPermanentFailure(recipient.action, recipient.status)) {
      if (!permanentEmails.includes(email)) permanentEmails.push(email);
      continue;
    }
    if (isDelay(recipient.action, recipient.status) && !delayedEmails.includes(email)) {
      delayedEmails.push(email);
    }
  }

  const byId = new Map<string, SentMessageRef>();
  for (const message of sent) {
    for (const id of extractMessageIds(message.messageId)) {
      if (!byId.has(id)) byId.set(id, message);
    }
  }
  let original: SentMessageRef | null = null;
  const matchedById: SentMessageRef[] = [];
  for (const id of mail.originalMessageIds) {
    const hit = byId.get(id);
    if (!hit) continue;
    original = hit;
    if (!matchedById.includes(hit)) matchedById.push(hit);
  }

  const delayOnly =
    permanentEmails.length === 0 &&
    (delayedEmails.length > 0 || (parsed.length === 0 && subjectLooksLikeDelay(mail.subject)));

  const contactById = new Map<string, SentMessageRef>();
  const consider = (message: SentMessageRef) => {
    if (!contactById.has(message.contactId)) contactById.set(message.contactId, message);
  };
  if (!delayOnly) {
    const permanent = new Set(permanentEmails);
    for (const message of sent) {
      if (permanent.has(message.contactEmail.toLowerCase())) consider(message);
    }
    for (const message of matchedById) {
      const email = message.contactEmail.toLowerCase();
      if (permanent.has(email) || permanentEmails.length === 0) {
        consider(message);
        if (!permanentEmails.includes(email)) permanentEmails.push(email);
      }
    }
  }

  return {
    signals,
    permanentEmails,
    delayedEmails,
    contacts: [...contactById.values()],
    original,
    delayOnly,
  };
}
