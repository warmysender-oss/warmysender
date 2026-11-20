/** Local shapes for inbox decisions. Task 01's Drizzle rows map onto these. */

export interface SentMessageRef {
  /** `messages.id` when the row came from the database. */
  id?: string;
  messageId: string;
  contactId: string;
  contactEmail: string;
  enrollmentId: string;
  campaignId: string;
  stepId: string;
  mailboxId: string;
  subject: string;
  /** ISO-8601 timestamp. Later values win the sender+subject fallback. */
  sentAt: string;
}

export interface DeliveryRecipient {
  finalRecipient: string | null;
  originalRecipient: string | null;
  action: string | null;
  status: string | null;
  diagnosticCode: string | null;
}

export interface InboundMail {
  from: string;
  to: string | null;
  subject: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  /** Lower-cased header names. Multiple values are joined with a space. */
  headers: Record<string, string>;
  contentType: string | null;
  text: string;
  recipients: DeliveryRecipient[];
  /** Message-ids copied from a nested message/rfc822 part. */
  originalMessageIds: string[];
}

export type MatchMethod = "in_reply_to" | "references" | "sender_subject" | "original_message";

export interface ReplyMatch {
  method: MatchMethod;
  sent: SentMessageRef;
}

export type InboundKind = "reply" | "auto_reply" | "bounce" | "delivery_delay" | "unmatched";

export interface ContactEffect {
  contactId: string;
  status: "replied" | "bounced";
  stopEnrollments: boolean;
}

export interface InboundDecision {
  kind: InboundKind;
  match: ReplyMatch | null;
  autoReplySignals: string[];
  bounceSignals: string[];
  contactEffects: ContactEffect[];
  /** Lower-cased addresses to add to the global suppression list. */
  suppressEmails: string[];
  /** Bounce recognised, and no sent message or recipient resolved to a contact. */
  unresolvedBounce: boolean;
}

export type InboxEffect =
  | { op: "store_inbound"; kind: InboundKind }
  | { op: "set_contact_status"; contactId: string; status: "replied" | "bounced" }
  | { op: "stop_enrollments"; contactId: string; reason: "reply" | "bounce" }
  | { op: "suppress_email"; email: string };

export const INBOX_POLL_EVERY_MS = 5 * 60 * 1000;
export const INBOX_POLL_JOB = "inbox.poll";
