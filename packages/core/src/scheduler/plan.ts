import { evaluateCandidate, skipDecision } from "./evaluate.js";
import type {
  MailboxSnapshot,
  PlanResult,
  SendCandidate,
  SendDecision,
  SuppressionEntry,
} from "./types.js";

/**
 * One scheduler minute.
 * Each mailbox contributes at most one send. A candidate that fails a safety
 * check is skipped with that reason; one_at_a_time is only used when the
 * candidate was otherwise allowed and this mailbox already has a send.
 */
export function planSendTick(input: {
  now: Date;
  mailboxes: readonly MailboxSnapshot[];
  candidates: readonly SendCandidate[];
  suppressions: readonly SuppressionEntry[];
  inFlightMailboxIds: readonly string[];
}): PlanResult {
  const mailboxes = new Map(input.mailboxes.map((mailbox) => [mailbox.id, mailbox]));
  const inFlight = new Set(input.inFlightMailboxIds);
  const grouped = new Map<string, SendCandidate[]>();

  const skips = [];
  for (const candidate of input.candidates) {
    const assigned = resolveMailbox(candidate, input, mailboxes);
    if (assigned.ok === false) {
      skips.push(assigned.skip);
      continue;
    }
    const list = grouped.get(assigned.candidate.mailboxId);
    if (list) list.push(assigned.candidate);
    else grouped.set(assigned.candidate.mailboxId, [assigned.candidate]);
  }

  const sends: SendDecision[] = [];
  const mailboxIds = [...grouped.keys()].sort();
  for (const mailboxId of mailboxIds) {
    const mailbox = mailboxes.get(mailboxId);
    if (!mailbox) continue;
    const queue = grouped.get(mailboxId) ?? [];
    queue.sort(compareCandidates);
    let chosen = false;
    for (const candidate of queue) {
      const evaluation = evaluateCandidate({
        now: input.now,
        mailbox,
        candidate,
        suppressions: input.suppressions,
      });
      if (!evaluation.ok) {
        skips.push(
          skipDecision({
            reason: evaluation.reason,
            mailboxId: mailbox.id,
            enrollmentId: candidate.enrollmentId,
            contactId: candidate.contactId,
          }),
        );
        continue;
      }
      if (inFlight.has(mailbox.id)) {
        skips.push(
          skipDecision({
            reason: "mailbox_busy",
            mailboxId: mailbox.id,
            enrollmentId: candidate.enrollmentId,
            contactId: candidate.contactId,
          }),
        );
        continue;
      }
      if (chosen) {
        skips.push(
          skipDecision({
            reason: "one_at_a_time",
            mailboxId: mailbox.id,
            enrollmentId: candidate.enrollmentId,
            contactId: candidate.contactId,
          }),
        );
        continue;
      }
      chosen = true;
      sends.push({
        action: "send",
        mailboxId: mailbox.id,
        enrollmentId: candidate.enrollmentId,
        contactId: candidate.contactId,
        campaignId: candidate.campaignId,
        stepId: candidate.stepId,
        stepNumber: candidate.stepNumber,
        effectiveCap: evaluation.effectiveCap,
        sentToday: evaluation.sentToday,
        candidate,
      });
    }
  }

  return { sends, skips };
}

/**
 * Step 1 with no mailbox rotates across the campaign's mailboxes.
 * Prefer a mailbox that is allowed to send right now, fewest sends today, then id.
 * A contact that already has a mailbox stays on it.
 */
function resolveMailbox(
  candidate: SendCandidate,
  input: {
    now: Date;
    suppressions: readonly SuppressionEntry[];
    inFlightMailboxIds: readonly string[];
  },
  mailboxes: Map<string, MailboxSnapshot>,
): { ok: true; candidate: SendCandidate & { mailboxId: string } } | { ok: false; skip: ReturnType<typeof skipDecision> } {
  if (candidate.mailboxId) {
    if (!mailboxes.has(candidate.mailboxId)) {
      return {
        ok: false,
        skip: skipDecision({
          reason: "unknown_mailbox",
          mailboxId: candidate.mailboxId,
          enrollmentId: candidate.enrollmentId,
          contactId: candidate.contactId,
        }),
      };
    }
    return { ok: true, candidate: { ...candidate, mailboxId: candidate.mailboxId } };
  }

  const choices = [...new Set(candidate.mailboxChoices)].filter((id) => mailboxes.has(id));
  if (choices.length === 0) {
    return {
      ok: false,
      skip: skipDecision({
        reason: "unknown_mailbox",
        mailboxId: null,
        enrollmentId: candidate.enrollmentId,
        contactId: candidate.contactId,
      }),
    };
  }

  const eligible: { id: string; sentToday: number }[] = [];
  let fallback: ReturnType<typeof skipDecision> | null = null;
  for (const id of [...choices].sort()) {
    const mailbox = mailboxes.get(id);
    if (!mailbox) continue;
    const trial = { ...candidate, mailboxId: id };
    const evaluation = evaluateCandidate({
      now: input.now,
      mailbox,
      candidate: trial,
      suppressions: input.suppressions,
    });
    if (evaluation.ok && !input.inFlightMailboxIds.includes(id)) {
      eligible.push({ id, sentToday: evaluation.sentToday });
    } else if (!fallback) {
      fallback = skipDecision({
        reason: evaluation.ok ? "mailbox_busy" : evaluation.reason,
        mailboxId: id,
        enrollmentId: candidate.enrollmentId,
        contactId: candidate.contactId,
      });
    }
  }
  eligible.sort((a, b) => a.sentToday - b.sentToday || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const chosen = eligible[0];
  if (!chosen) {
    return { ok: false, skip: fallback ?? skipDecision({
      reason: "unknown_mailbox",
      mailboxId: null,
      enrollmentId: candidate.enrollmentId,
      contactId: candidate.contactId,
    }) };
  }
  return { ok: true, candidate: { ...candidate, mailboxId: chosen.id } };
}

function compareCandidates(a: SendCandidate, b: SendCandidate): number {
  const due = a.dueAt.getTime() - b.dueAt.getTime();
  if (due !== 0) return due;
  if (a.enrollmentId < b.enrollmentId) return -1;
  if (a.enrollmentId > b.enrollmentId) return 1;
  return 0;
}
