import type { MailboxSnapshot } from "./types.js";
import { isValidTimeZone, parseYmd } from "./time.js";
import { minuteOfDay } from "./window.js";

/** Null when the mailbox can be evaluated. A string names the broken field. */
export function scheduleProblem(mailbox: MailboxSnapshot): string | null {
  if (!isValidTimeZone(mailbox.timezone)) return "timezone";
  if (minuteOfDay(mailbox.windowStart) === null || minuteOfDay(mailbox.windowEnd) === null) {
    return "window";
  }
  if (!Array.isArray(mailbox.sendingDays)) return "sending_days";
  for (const day of mailbox.sendingDays) {
    if (!Number.isInteger(day) || day < 0 || day > 6) return "sending_days";
  }
  if (!Number.isInteger(mailbox.minGapMinutes) || !Number.isInteger(mailbox.maxGapMinutes)) {
    return "gap";
  }
  if (mailbox.minGapMinutes < 1 || mailbox.maxGapMinutes < mailbox.minGapMinutes) return "gap";
  if (!Number.isFinite(mailbox.dailyCap)) return "cap";
  if (!parseYmd(mailbox.rampStartedOn)) return "ramp_started_on";
  return null;
}
