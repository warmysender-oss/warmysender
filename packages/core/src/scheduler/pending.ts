/**
 * How long a worker may hold a mailbox, and how long a pending row may sit
 * after SMTP has started before a restart treats the outcome as unknown.
 * The spec does not set this. Three minutes is long enough for one SMTP call
 * and short enough that a dead worker does not block the mailbox all day.
 */
export const SEND_CLAIM_MS = 3 * 60 * 1000;

export type InFlightDisposition = "none" | "in_flight" | "uncertain";

/**
 * A pending row with sendStartedAt and no retry time is an SMTP call that has
 * not been recorded yet.
 * Younger than SEND_CLAIM_MS: leave it. Another worker may still be in SMTP.
 * Older than that: do not send it again. The message may already have gone out.
 */
export function inFlightDisposition(input: {
  status: string;
  sendStartedAt: Date | null;
  nextAttemptAt: Date | null;
  now: Date;
}): InFlightDisposition {
  if (input.status !== "pending") return "none";
  if (input.nextAttemptAt) return "none";
  if (!input.sendStartedAt) return "none";
  const age = input.now.getTime() - input.sendStartedAt.getTime();
  if (age >= SEND_CLAIM_MS) return "uncertain";
  return "in_flight";
}
