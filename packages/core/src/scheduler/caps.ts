import {
  HARD_MAX_DAILY_CAP,
  RAMP_CAP_DAYS_1_TO_7,
  RAMP_CAP_DAYS_8_TO_14,
  RAMP_FIRST_WEEK_LAST_DAY,
  RAMP_SECOND_WEEK_LAST_DAY,
} from "./constants.js";
import { calendarDaysBetween, formatYmd, partsFromFormatter, zonedFormatter } from "./time.js";

/**
 * Floor the configured cap and clamp it to the hard max.
 * Zero or negative means the mailbox cannot send. Non-finite is invalid.
 */
export function clampDailyCap(dailyCap: number): number | null {
  if (!Number.isFinite(dailyCap)) return null;
  if (dailyCap <= 0) return 0;
  return Math.min(Math.floor(dailyCap), HARD_MAX_DAILY_CAP);
}

/**
 * Ramp day 1 is `rampStartedOn`. A local today before that date stays on day 1
 * so a clock skew cannot skip the ramp.
 */
export function rampDayNumber(rampStartedOn: string, localToday: string): number | null {
  const diff = calendarDaysBetween(rampStartedOn, localToday);
  if (diff === null) return null;
  if (diff < 0) return 1;
  return diff + 1;
}

/** Cap for that ramp day, or null when the mailbox's own cap applies. */
export function rampCapForDay(rampDay: number): number | null {
  if (!Number.isInteger(rampDay) || rampDay < 1) return null;
  if (rampDay <= RAMP_FIRST_WEEK_LAST_DAY) return RAMP_CAP_DAYS_1_TO_7;
  if (rampDay <= RAMP_SECOND_WEEK_LAST_DAY) return RAMP_CAP_DAYS_8_TO_14;
  return null;
}

/**
 * Sends allowed today: the lower of the clamped mailbox cap and the ramp cap.
 * Never above {@link HARD_MAX_DAILY_CAP}.
 */
export function effectiveDailyCap(dailyCap: number, rampDay: number): number | null {
  const configured = clampDailyCap(dailyCap);
  if (configured === null) return null;
  const ramp = rampCapForDay(rampDay);
  if (ramp === null) {
    if (!Number.isInteger(rampDay) || rampDay < 1) return null;
    return configured;
  }
  return Math.min(configured, ramp);
}

export function countSentOnLocalDay(
  sentAtTimes: readonly Date[],
  now: Date,
  timeZone: string,
): number | null {
  const dtf = zonedFormatter(timeZone);
  if (!dtf) return null;
  const todayParts = partsFromFormatter(now, dtf);
  if (!todayParts) return null;
  const today = formatYmd(todayParts.year, todayParts.month, todayParts.day);
  let count = 0;
  for (const sentAt of sentAtTimes) {
    const parts = partsFromFormatter(sentAt, dtf);
    if (!parts) continue;
    if (formatYmd(parts.year, parts.month, parts.day) === today) count += 1;
  }
  return count;
}

export function underDailyCap(sentToday: number, effectiveCap: number): boolean {
  return sentToday < effectiveCap;
}
