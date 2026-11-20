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
    const mailbox = mailboxes.get(candidate.mailboxId);
    if (!mailbox) {
      skips.push(
        skipDecision({
          reason: "unknown_mailbox",
          mailboxId: candidate.mailboxId,
          enrollmentId: candidate.enrollmentId,
          contactId: candidate.contactId,
        }),
      );
      continue;
    }
    const list = grouped.get(mailbox.id);
    if (list) list.push(candidate);
    else grouped.set(mailbox.id, [candidate]);
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

function compareCandidates(a: SendCandidate, b: SendCandidate): number {
  const due = a.dueAt.getTime() - b.dueAt.getTime();
  if (due !== 0) return due;
  if (a.enrollmentId < b.enrollmentId) return -1;
  if (a.enrollmentId > b.enrollmentId) return 1;
  return 0;
}
