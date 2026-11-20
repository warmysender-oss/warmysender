import { countSentOnLocalDay, effectiveDailyCap, rampDayNumber, underDailyCap } from "./caps.js";
import { enforcedGapMinutes, gapElapsed, latestSentAt } from "./gap.js";
import { formatSendLog } from "./log.js";
import { scheduleProblem } from "./schedule.js";
import { isDeliverableAddress, isSuppressed } from "./suppression.js";
import { formatYmd, zonedParts } from "./time.js";
import type { MailboxSnapshot, SendCandidate, SkipDecision, SkipReason, SuppressionEntry } from "./types.js";
import { isInsideWindow, isSendingDay } from "./window.js";
import { MAX_SEND_ATTEMPTS } from "./constants.js";
import { unsubscribeHeaders } from "../mail/send-headers.js";
import { resolveSubject, threadingHeaders } from "../mail/send-threading.js";

export type Evaluation =
  | {
      ok: true;
      effectiveCap: number;
      sentToday: number;
    }
  | {
      ok: false;
      reason: SkipReason;
    };

/**
 * Every gate that must pass before a mailbox is allowed to send this candidate.
 * Operational contention (already sending, or another send chosen this minute)
 * is applied by the planner after this returns ok.
 */
export function evaluateCandidate(input: {
  now: Date;
  mailbox: MailboxSnapshot;
  candidate: SendCandidate;
  suppressions: readonly SuppressionEntry[];
}): Evaluation {
  const schedule = scheduleProblem(input.mailbox);
  if (schedule) return { ok: false, reason: "invalid_schedule" };
  if (input.mailbox.paused) return { ok: false, reason: "mailbox_paused" };
  if (input.candidate.campaignStatus !== "running") {
    return { ok: false, reason: "campaign_not_running" };
  }
  const contactBlock = contactBlockReason(input.candidate.contactStatus);
  if (contactBlock) return { ok: false, reason: contactBlock };
  if (isSuppressed(input.candidate.contactEmail, input.suppressions)) {
    return { ok: false, reason: "suppressed" };
  }
  if (input.candidate.enrollmentStatus !== "active") {
    return { ok: false, reason: "enrollment_not_active" };
  }
  if (input.candidate.attempts >= MAX_SEND_ATTEMPTS) {
    return { ok: false, reason: "send_failed" };
  }
  if (input.candidate.retryAt && input.candidate.retryAt.getTime() > input.now.getTime()) {
    return { ok: false, reason: "retry_waiting" };
  }
  if (input.candidate.attempts > 0 && !input.candidate.retryAt) {
    return { ok: false, reason: "send_failed" };
  }
  if (!isDeliverableAddress(input.candidate.contactEmail)) {
    return { ok: false, reason: "invalid_recipient" };
  }
  if (!resolveSubject(input.candidate).ok) return { ok: false, reason: "missing_subject" };
  if (!threadingHeaders(input.candidate).ok) return { ok: false, reason: "missing_thread" };
  if (!unsubscribeHeaders(input.candidate.publicUrl, input.candidate.unsubscribeToken)) {
    return { ok: false, reason: "invalid_unsubscribe_url" };
  }
  if (input.candidate.dueAt.getTime() > input.now.getTime()) {
    return { ok: false, reason: "not_due" };
  }

  const parts = zonedParts(input.now, input.mailbox.timezone);
  if (!parts) return { ok: false, reason: "invalid_schedule" };
  if (!isSendingDay(parts.weekday, input.mailbox.sendingDays)) {
    return { ok: false, reason: "not_sending_day" };
  }
  const inside = isInsideWindow(
    parts.hour * 60 + parts.minute,
    input.mailbox.windowStart,
    input.mailbox.windowEnd,
  );
  if (inside === null) return { ok: false, reason: "invalid_schedule" };
  if (!inside) return { ok: false, reason: "outside_window" };

  const today = formatYmd(parts.year, parts.month, parts.day);
  const rampDay = rampDayNumber(input.mailbox.rampStartedOn, today);
  if (rampDay === null) return { ok: false, reason: "invalid_schedule" };
  const cap = effectiveDailyCap(input.mailbox.dailyCap, rampDay);
  const sentToday = countSentOnLocalDay(
    input.mailbox.sentAtTimes,
    input.now,
    input.mailbox.timezone,
  );
  if (cap === null || sentToday === null) return { ok: false, reason: "invalid_schedule" };
  if (!underDailyCap(sentToday, cap)) return { ok: false, reason: "daily_cap" };

  const wait = enforcedGapMinutes(input.mailbox);
  const last = latestSentAt(input.mailbox.sentAtTimes);
  if (!gapElapsed(last, input.now, wait)) return { ok: false, reason: "gap_not_elapsed" };

  return { ok: true, effectiveCap: cap, sentToday };
}

function contactBlockReason(status: SendCandidate["contactStatus"]): SkipReason | null {
  if (status === "active") return null;
  if (status === "replied") return "contact_replied";
  if (status === "bounced") return "contact_bounced";
  if (status === "unsubscribed") return "contact_unsubscribed";
  return "contact_not_active";
}

export function skipDecision(input: {
  reason: SkipReason;
  mailboxId: string | null;
  enrollmentId: string | null;
  contactId: string | null;
}): SkipDecision {
  return {
    action: "skip",
    reason: input.reason,
    mailboxId: input.mailboxId,
    enrollmentId: input.enrollmentId,
    contactId: input.contactId,
    log: formatSendLog("skipped", {
      reason: input.reason,
      mailbox: input.mailboxId ?? undefined,
      enrollment: input.enrollmentId ?? undefined,
      contact: input.contactId ?? undefined,
    }),
  };
}
