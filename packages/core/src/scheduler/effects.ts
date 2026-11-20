import { advanceEnrollment } from "./advance.js";
import { pickGapMinutes } from "./gap.js";
import { formatSendLog } from "./log.js";
import { decideAfterFailure, retryAt } from "./retry.js";
import type { SendFailure } from "./retry.js";
import type { ContactStatus, MailboxSnapshot, SendDecision } from "./types.js";
import type { OutgoingEmail } from "../mail/send-message.js";

export type SmtpTransport = {
  send: (
    email: OutgoingEmail,
    mailboxId: string,
  ) => Promise<{ ok: true; messageId?: string } | { ok: false; failure: SendFailure }>;
};

export type StoredMessage = {
  mailboxId: string;
  enrollmentId: string;
  contactId: string;
  campaignId: string;
  stepId: string;
  stepNumber: number;
  messageId: string;
  subject: string;
  inReplyTo: string | null;
  references: string | null;
  /** Matches messages.status: pending while waiting to retry, failed for a hard failure or 5xx. */
  status: "sent" | "failed" | "pending";
  error: string | null;
  attempt: number;
  retryAt: Date | null;
  sentAt: Date | null;
  bodyText: string;
  bodyHtml: string | null;
};

export type EnrollmentUpdate = {
  status?: "active" | "stopped" | "completed";
  stopReason?: string | null;
  stepNumber?: number;
  nextSendAt?: Date | null;
  mailboxId?: string;
  attempts?: number;
  retryAt?: Date | null;
};

export type MailboxUpdate = {
  appendSentAt?: Date;
  nextGapMinutes?: number;
  consecutiveAuthFailures?: number;
  consecutivePolicyFailures?: number;
  paused?: boolean;
  pausedReason?: string | null;
};

export type CycleEffect =
  | { type: "log"; line: string }
  | { type: "message"; message: StoredMessage }
  | { type: "enrollment"; enrollmentId: string; update: EnrollmentUpdate }
  | { type: "contact"; contactId: string; status: ContactStatus }
  | { type: "suppression"; email: string }
  | { type: "mailbox"; mailboxId: string; update: MailboxUpdate };

export function effectsForDelivery(input: {
  now: Date;
  decision: SendDecision;
  mailbox: MailboxSnapshot;
  email: OutgoingEmail;
  rng: () => number;
  result: { ok: true; messageId?: string } | { ok: false; failure: SendFailure };
}): CycleEffect[] {
  const email = input.email;
  if (!input.result.ok) {
    return failureEffects({
      now: input.now,
      decision: input.decision,
      mailbox: input.mailbox,
      email,
      failure: input.result.failure,
    });
  }
  const messageId = input.result.messageId?.trim()
    ? normalizeReturnedId(input.result.messageId)
    : email.messageId;
  const advanced = advanceEnrollment({
    sentAt: input.now,
    timeZone: input.mailbox.timezone,
    nextStep: input.decision.candidate.nextStep,
  });
  const nextGapMinutes = pickGapMinutes(
    input.mailbox.minGapMinutes,
    input.mailbox.maxGapMinutes,
    input.rng,
  );
  const effects: CycleEffect[] = [
    {
      type: "log",
      line: formatSendLog("sent", {
        mailbox: input.decision.mailboxId,
        enrollment: input.decision.enrollmentId,
        contact: input.decision.contactId,
        campaign: input.decision.campaignId,
        step: input.decision.stepNumber,
        messageId,
      }),
    },
    {
      type: "message",
      message: {
        mailboxId: input.decision.mailboxId,
        enrollmentId: input.decision.enrollmentId,
        contactId: input.decision.contactId,
        campaignId: input.decision.campaignId,
        stepId: input.decision.stepId,
        stepNumber: input.decision.stepNumber,
        messageId,
        subject: email.subject,
        inReplyTo: email.inReplyTo,
        references: email.references,
        status: "sent",
        error: null,
        attempt: input.decision.candidate.attempts + 1,
        retryAt: null,
        sentAt: input.now,
        bodyText: email.text,
        bodyHtml: email.html,
      },
    },
    {
      type: "mailbox",
      mailboxId: input.decision.mailboxId,
      update: {
        appendSentAt: input.now,
        nextGapMinutes,
        consecutiveAuthFailures: 0,
        consecutivePolicyFailures: 0,
      },
    },
  ];
  if (advanced.status === "completed") {
    effects.push({
      type: "enrollment",
      enrollmentId: input.decision.enrollmentId,
      update: {
        status: "completed",
        stopReason: null,
        nextSendAt: null,
        mailboxId: input.decision.mailboxId,
        attempts: 0,
        retryAt: null,
      },
    });
  } else if (advanced.status === "stopped") {
    effects.push({
      type: "enrollment",
      enrollmentId: input.decision.enrollmentId,
      update: {
        status: "stopped",
        stopReason: advanced.reason,
        mailboxId: input.decision.mailboxId,
        attempts: 0,
        retryAt: null,
      },
    });
  } else {
    effects.push({
      type: "enrollment",
      enrollmentId: input.decision.enrollmentId,
      update: {
        status: "active",
        stepNumber: advanced.stepNumber,
        nextSendAt: advanced.nextSendAt,
        mailboxId: input.decision.mailboxId,
        attempts: 0,
        retryAt: null,
        stopReason: null,
      },
    });
  }
  return effects;
}

export function effectsForTemplateMiss(input: {
  decision: SendDecision;
  fields: readonly string[];
}): CycleEffect[] {
  const reason = `missing_variable:${input.fields.join(",")}`;
  return [
    {
      type: "log",
      line: formatSendLog("failed", {
        reason,
        mailbox: input.decision.mailboxId,
        enrollment: input.decision.enrollmentId,
        contact: input.decision.contactId,
        campaign: input.decision.campaignId,
        step: input.decision.stepNumber,
      }),
    },
    {
      type: "message",
      message: {
        mailboxId: input.decision.mailboxId,
        enrollmentId: input.decision.enrollmentId,
        contactId: input.decision.contactId,
        campaignId: input.decision.campaignId,
        stepId: input.decision.stepId,
        stepNumber: input.decision.stepNumber,
        messageId: "",
        subject: "",
        inReplyTo: null,
        references: null,
        status: "failed",
        error: reason,
        attempt: input.decision.candidate.attempts,
        retryAt: null,
        sentAt: null,
        bodyText: "",
        bodyHtml: null,
      },
    },
    {
      type: "enrollment",
      enrollmentId: input.decision.enrollmentId,
      update: {
        status: "stopped",
        stopReason: "missing_variable",
        mailboxId: input.decision.mailboxId,
      },
    },
  ];
}

function failureEffects(input: {
  now: Date;
  decision: SendDecision;
  mailbox: MailboxSnapshot;
  email: OutgoingEmail;
  failure: SendFailure;
}): CycleEffect[] {
  const decision = decideAfterFailure({
    attemptsSoFar: input.decision.candidate.attempts,
    consecutiveAuthFailures: input.mailbox.consecutiveAuthFailures,
    consecutivePolicyFailures: input.mailbox.consecutivePolicyFailures,
    failure: input.failure,
  });
  const baseMessage = {
    mailboxId: input.decision.mailboxId,
    enrollmentId: input.decision.enrollmentId,
    contactId: input.decision.contactId,
    campaignId: input.decision.campaignId,
    stepId: input.decision.stepId,
    stepNumber: input.decision.stepNumber,
    messageId: input.email.messageId,
    subject: input.email.subject,
    inReplyTo: input.email.inReplyTo,
    references: input.email.references,
    bodyText: input.email.text,
    bodyHtml: input.email.html,
  };

  if (decision.kind === "retry") {
    const when = retryAt(input.now, decision.delayMs);
    return [
      {
        type: "log",
        line: formatSendLog("retry", {
          reason: decision.reason,
          attempt: decision.attempts,
          delayMs: decision.delayMs,
          mailbox: input.decision.mailboxId,
          enrollment: input.decision.enrollmentId,
        }),
      },
      {
        type: "message",
        message: {
          ...baseMessage,
          status: "pending",
          error: decision.reason,
          attempt: decision.attempts,
          retryAt: when,
          sentAt: null,
        },
      },
      {
        type: "enrollment",
        enrollmentId: input.decision.enrollmentId,
        update: {
          status: "active",
          mailboxId: input.decision.mailboxId,
          attempts: decision.attempts,
          retryAt: when,
        },
      },
      {
        type: "mailbox",
        mailboxId: input.decision.mailboxId,
        update: { consecutiveAuthFailures: decision.consecutiveAuthFailures },
      },
    ];
  }

  if (decision.kind === "pause_mailbox") {
    return [
      {
        type: "log",
        line: formatSendLog("paused", {
          reason: "auth_failures",
          mailbox: input.decision.mailboxId,
          count: decision.consecutiveAuthFailures,
        }),
      },
      {
        type: "mailbox",
        mailboxId: input.decision.mailboxId,
        update: {
          paused: true,
          pausedReason: decision.reason,
          consecutiveAuthFailures: decision.consecutiveAuthFailures,
        },
      },
    ];
  }

  if (decision.kind === "policy_block") {
    return [
      {
        type: "log",
        line: formatSendLog("failed", {
          reason: "policy_block",
          mailbox: input.decision.mailboxId,
          enrollment: input.decision.enrollmentId,
          contact: input.decision.contactId,
        }),
      },
      {
        type: "message",
        message: {
          ...baseMessage,
          status: "failed",
          error: decision.reason,
          attempt: decision.attempts,
          retryAt: null,
          sentAt: null,
        },
      },
      {
        type: "enrollment",
        enrollmentId: input.decision.enrollmentId,
        update: {
          status: "stopped",
          stopReason: "policy_block",
          mailboxId: input.decision.mailboxId,
          attempts: decision.attempts,
          retryAt: null,
        },
      },
      {
        type: "mailbox",
        mailboxId: input.decision.mailboxId,
        update: { consecutivePolicyFailures: decision.consecutivePolicyFailures },
      },
    ];
  }

  if (decision.kind === "bounce") {
    return [
      {
        type: "log",
        line: formatSendLog("bounced", {
          reason: "smtp_5xx",
          mailbox: input.decision.mailboxId,
          enrollment: input.decision.enrollmentId,
          contact: input.decision.contactId,
        }),
      },
      {
        type: "message",
        message: {
          ...baseMessage,
          status: "failed",
          error: "smtp_5xx",
          attempt: decision.attempts,
          retryAt: null,
          sentAt: null,
        },
      },
      {
        type: "contact",
        contactId: input.decision.contactId,
        status: "bounced",
      },
      { type: "suppression", email: input.decision.candidate.contactEmail.trim().toLowerCase() },
      {
        type: "enrollment",
        enrollmentId: input.decision.enrollmentId,
        update: {
          status: "stopped",
          stopReason: "bounce",
          mailboxId: input.decision.mailboxId,
          attempts: decision.attempts,
          retryAt: null,
        },
      },
      {
        type: "mailbox",
        mailboxId: input.decision.mailboxId,
        update: { consecutiveAuthFailures: 0 },
      },
    ];
  }

  return [
    {
      type: "log",
      line: formatSendLog("failed", {
        reason: decision.reason,
        attempt: decision.attempts,
        mailbox: input.decision.mailboxId,
        enrollment: input.decision.enrollmentId,
      }),
    },
    {
      type: "message",
      message: {
        ...baseMessage,
        status: "failed",
        error: decision.reason,
        attempt: decision.attempts,
        retryAt: null,
        sentAt: null,
      },
    },
    {
      type: "enrollment",
      enrollmentId: input.decision.enrollmentId,
      update: {
        status: "stopped",
        stopReason: "send_failed",
        mailboxId: input.decision.mailboxId,
        attempts: decision.attempts,
        retryAt: null,
      },
    },
    {
      type: "mailbox",
      mailboxId: input.decision.mailboxId,
      update: { consecutiveAuthFailures: 0 },
    },
  ];
}

function normalizeReturnedId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed;
  return `<${trimmed}>`;
}
