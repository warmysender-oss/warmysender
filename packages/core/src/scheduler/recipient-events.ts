import type { ContactStatus, EnrollmentStatus } from "./types.js";

export type InboundClassificationInput = {
  autoSubmitted?: string | null;
  xAutoreply?: string | null;
  xAutorespond?: string | null;
  subject?: string | null;
  /** True when the message is a DSN, mailer-daemon, or postmaster report. */
  bounceReport?: boolean;
};

export type InboundClass = "reply" | "auto_reply" | "bounce";

/**
 * Auto-replies are detected only from the signals in spec §3.6:
 * Auto-Submitted (other than "no"), X-Autoreply, X-Autorespond,
 * and subjects that say "out of office".
 * A bounce report wins over an auto-reply header so a DSN still suppresses.
 */
export function classifyInbound(input: InboundClassificationInput): InboundClass {
  if (input.bounceReport) return "bounce";
  if (isAutoReply(input)) return "auto_reply";
  return "reply";
}

export function isAutoReply(input: InboundClassificationInput): boolean {
  const autoSubmitted = (input.autoSubmitted ?? "").trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if ((input.xAutoreply ?? "").trim()) return true;
  if ((input.xAutorespond ?? "").trim()) return true;
  const subject = input.subject ?? "";
  return /out of office/i.test(subject) || /out-of-office/i.test(subject);
}

export type EnrollmentRef = {
  id: string;
  status: EnrollmentStatus;
};

export type RecipientEffect = {
  contactStatus: ContactStatus;
  enrollments: EnrollmentRef[];
  /** Lower-cased email to add to the global suppression list, or null. */
  suppressEmail: string | null;
  /** True when a real reply, bounce, or unsubscribe stops the sequence. */
  sequenceStopped: boolean;
};

/**
 * Spec §3.6 / §6: a real reply stops every enrollment and does not suppress.
 * An auto-reply changes nothing. A bounce or unsubscribe stops enrollments
 * and suppresses the address. Already-stopped enrollments stay stopped.
 */
export function applyRecipientEvent(input: {
  kind: "reply" | "auto_reply" | "bounce" | "unsubscribe";
  contactStatus: ContactStatus;
  email: string;
  enrollments: readonly EnrollmentRef[];
}): RecipientEffect {
  if (input.kind === "auto_reply") {
    return {
      contactStatus: input.contactStatus,
      enrollments: input.enrollments.map((enrollment) => ({ ...enrollment })),
      suppressEmail: null,
      sequenceStopped: false,
    };
  }

  const contactStatus: ContactStatus =
    input.kind === "reply"
      ? "replied"
      : input.kind === "bounce"
        ? "bounced"
        : "unsubscribed";

  return {
    contactStatus,
    enrollments: input.enrollments.map((enrollment) => ({
      id: enrollment.id,
      status: enrollment.status === "active" ? "stopped" : enrollment.status,
    })),
    suppressEmail: input.kind === "reply" ? null : input.email.trim().toLowerCase(),
    sequenceStopped: true,
  };
}
