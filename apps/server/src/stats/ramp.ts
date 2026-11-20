/** Spec §3.2 ramp, used by mailbox stats. Days are calendar dates in the mailbox timezone. */

export const HARD_MAX_DAILY_CAP = 50;
export const DEFAULT_DAILY_CAP = 30;
export const RAMP_CAP_DAYS_1_TO_7 = 10;
export const RAMP_CAP_DAYS_8_TO_14 = 20;

export type RampPhase = "days_1_7" | "days_8_14" | "graduated";

export function assertDailyCap(configuredCap: number): number {
  if (!Number.isInteger(configuredCap) || configuredCap < 1 || configuredCap > HARD_MAX_DAILY_CAP) {
    throw new RangeError(`Daily cap must be an integer from 1 to ${HARD_MAX_DAILY_CAP}`);
  }
  return configuredCap;
}

export function parseIsoDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid date: ${value}`);
  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error(`Invalid date: ${value}`);
  }
  return utc;
}

/** Calendar date in a mailbox timezone, `YYYY-MM-DD`. */
export function localIsoDate(now: Date, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
  } catch {
    throw new Error(`Invalid time zone: ${timeZone}`);
  }
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = read("year");
  const month = read("month");
  const day = read("day");
  if (!year || !month || !day) throw new Error(`Invalid time zone: ${timeZone}`);
  return `${year}-${month}-${day}`;
}

/** Day 1 is `rampStartedOn`. A later `today` is a larger day number. */
export function rampDayNumber(rampStartedOn: string, today: string): number {
  const diffDays = Math.round((parseIsoDate(today) - parseIsoDate(rampStartedOn)) / 86_400_000);
  return diffDays + 1;
}

export function rampPhase(day: number): RampPhase {
  if (day <= 7) return "days_1_7";
  if (day <= 14) return "days_8_14";
  return "graduated";
}

/** Effective cap for a ramp day. The configured cap is never raised, and never passes 50. */
export function effectiveDailyCap(configuredCap: number, day: number): number {
  const configured = assertDailyCap(configuredCap);
  const phaseDay = day < 1 ? 1 : day;
  if (phaseDay <= 7) return Math.min(configured, RAMP_CAP_DAYS_1_TO_7);
  if (phaseDay <= 14) return Math.min(configured, RAMP_CAP_DAYS_8_TO_14);
  return configured;
}

/** Spec §3.2 UI string. Graduated mailboxes have no ramp label. */
export function rampLabel(day: number, effectiveCap: number): string | null {
  if (rampPhase(day) === "graduated") return null;
  return `Day ${day} of ramp: ${effectiveCap} a day`;
}
