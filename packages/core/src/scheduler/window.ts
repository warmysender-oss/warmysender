import { zonedParts } from "./time.js";

/** Minutes since local midnight, or null when the string is not HH:mm. */
export function minuteOfDay(hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Start inclusive, end exclusive.
 * Equal bounds cover the whole day (there is no empty clock range that still
 * has a window configured). Overnight windows (22:00–06:00) wrap midnight.
 * The sending-day check uses the local calendar date of `now`, including the
 * morning half of an overnight window.
 */
export function isInsideWindow(
  localMinutes: number,
  windowStart: string,
  windowEnd: string,
): boolean | null {
  const start = minuteOfDay(windowStart);
  const end = minuteOfDay(windowEnd);
  if (start === null || end === null) return null;
  if (start === end) return true;
  if (start < end) return localMinutes >= start && localMinutes < end;
  return localMinutes >= start || localMinutes < end;
}

export function localMinutes(date: Date, timeZone: string): number | null {
  const parts = zonedParts(date, timeZone);
  if (!parts) return null;
  return parts.hour * 60 + parts.minute;
}

export function isSendingDay(weekday: number, sendingDays: readonly number[]): boolean {
  return sendingDays.includes(weekday);
}
