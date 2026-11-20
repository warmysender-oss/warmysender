import { detectAutoReply } from "./auto-reply.js";
import { analyzeBounce } from "./dsn.js";
import { matchReply } from "./match-reply.js";
import type { InboundDecision, InboundKind, InboundMail, InboxEffect, SentMessageRef } from "./types.js";

/**
 * Classify one inbound message.
 * A DSN wins over auto-reply headers (delivery notices are Auto-Submitted: auto-replied).
 * An auto-reply keeps its match so the inbox can thread it, and it has no contact effects.
 * A real reply sets the contact to replied and stops every enrollment for that contact.
 * A permanent bounce sets the contact to bounced, stops enrollments, and suppresses the address.
 * A delay notice is stored and changes nothing else.
 */
export function decideInbound(mail: InboundMail, sent: readonly SentMessageRef[]): InboundDecision {
  const bounce = analyzeBounce(mail, sent);
  if (bounce) {
    const originalMatch = bounce.original ? { method: "original_message" as const, sent: bounce.original } : null;
    if (bounce.delayOnly) {
      return {
        kind: "delivery_delay",
        match: originalMatch,
        autoReplySignals: [],
        bounceSignals: bounce.signals,
        contactEffects: [],
        suppressEmails: [],
        unresolvedBounce: false,
      };
    }
    return {
      kind: "bounce",
      match: originalMatch,
      autoReplySignals: [],
      bounceSignals: bounce.signals,
      contactEffects: bounce.contacts.map((message) => ({
        contactId: message.contactId,
        status: "bounced" as const,
        stopEnrollments: true,
      })),
      suppressEmails: bounce.permanentEmails,
      unresolvedBounce: bounce.contacts.length === 0,
    };
  }

  const autoReply = detectAutoReply(mail);
  const match = matchReply(mail, sent);
  if (autoReply.isAutoReply) {
    return {
      kind: "auto_reply",
      match,
      autoReplySignals: autoReply.signals,
      bounceSignals: [],
      contactEffects: [],
      suppressEmails: [],
      unresolvedBounce: false,
    };
  }
  if (match) {
    return {
      kind: "reply",
      match,
      autoReplySignals: [],
      bounceSignals: [],
      contactEffects: [{ contactId: match.sent.contactId, status: "replied", stopEnrollments: true }],
      suppressEmails: [],
      unresolvedBounce: false,
    };
  }
  return {
    kind: "unmatched",
    match: null,
    autoReplySignals: [],
    bounceSignals: [],
    contactEffects: [],
    suppressEmails: [],
    unresolvedBounce: false,
  };
}

/** Schema `inbound_messages.kind` has no delay or unmatched value. Both are stored as `other`. */
export function storedKind(kind: InboundKind): "reply" | "auto_reply" | "bounce" | "other" {
  if (kind === "reply" || kind === "auto_reply" || kind === "bounce") return kind;
  return "other";
}

/** Operations the worker applies, in order, inside one transaction. */
export function effectPlan(decision: InboundDecision): InboxEffect[] {
  const effects: InboxEffect[] = [{ op: "store_inbound", kind: decision.kind }];
  for (const contact of decision.contactEffects) {
    effects.push({ op: "set_contact_status", contactId: contact.contactId, status: contact.status });
    if (contact.stopEnrollments) {
      effects.push({
        op: "stop_enrollments",
        contactId: contact.contactId,
        reason: contact.status === "bounced" ? "bounce" : "reply",
      });
    }
  }
  for (const email of decision.suppressEmails) {
    effects.push({ op: "suppress_email", email });
  }
  return effects;
}

const TERMINAL_ENROLLMENT = new Set(["stopped", "completed", "replied", "bounced", "unsubscribed", "failed"]);

export interface EnrollmentRow {
  id: string;
  contactId: string;
  campaignId: string;
  status: string;
  stopReason: string | null;
}

export interface ContactRow {
  id: string;
  email: string;
  status: string;
}

export interface InboxSnapshot {
  contacts: ContactRow[];
  enrollments: EnrollmentRow[];
  suppressions: string[];
}

/** Pure stand-in for the database transaction the worker runs from `effectPlan`. */
export function applyEffectPlan(state: InboxSnapshot, decision: InboundDecision): InboxSnapshot {
  let contacts = state.contacts.map((contact) => ({ ...contact }));
  let enrollments = state.enrollments.map((enrollment) => ({ ...enrollment }));
  const suppressions = new Set(state.suppressions.map((email) => email.toLowerCase()));
  for (const effect of effectPlan(decision)) {
    if (effect.op === "set_contact_status") {
      contacts = contacts.map((contact) =>
        contact.id === effect.contactId ? { ...contact, status: effect.status } : contact,
      );
    } else if (effect.op === "stop_enrollments") {
      enrollments = enrollments.map((enrollment) => {
        if (enrollment.contactId !== effect.contactId) return enrollment;
        if (TERMINAL_ENROLLMENT.has(enrollment.status)) return enrollment;
        return { ...enrollment, status: "stopped", stopReason: effect.reason };
      });
    } else if (effect.op === "suppress_email") {
      suppressions.add(effect.email.toLowerCase());
    }
  }
  return { contacts, enrollments, suppressions: [...suppressions] };
}
