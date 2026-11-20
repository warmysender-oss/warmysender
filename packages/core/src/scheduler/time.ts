export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
};

export type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** ISO weekday: Monday = 1 … Sunday = 7. Matches mailboxes.sending_days. */
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 7,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const validZones = new Set<string>();
const invalidZones = new Set<string>();
const formatters = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(timeZone: string): boolean {
  if (validZones.has(timeZone)) return true;
  if (invalidZones.has(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    validZones.add(timeZone);
    return true;
  } catch {
    invalidZones.add(timeZone);
    return false;
  }
}

export function zonedFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  if (!isValidTimeZone(timeZone)) return null;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  formatters.set(timeZone, dtf);
  return dtf;
}

export function zonedParts(date: Date, timeZone: string): ZonedParts | null {
  const dtf = zonedFormatter(timeZone);
  if (!dtf) return null;
  return partsFromFormatter(date, dtf);
}

export function partsFromFormatter(date: Date, dtf: Intl.DateTimeFormat): ZonedParts | null {
  const bag: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  const weekday = WEEKDAY_INDEX[bag.weekday ?? ""];
  if (weekday === undefined) return null;
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekday,
  };
}

export function localYmd(date: Date, timeZone: string): string | null {
  const parts = zonedParts(date, timeZone);
  if (!parts) return null;
  return formatYmd(parts.year, parts.month, parts.day);
}

export function formatYmd(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Whole calendar days from startYmd to endYmd (negative when end is earlier). */
export function calendarDaysBetween(startYmd: string, endYmd: string): number | null {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end) return null;
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endMs - startMs) / 86_400_000);
}

/**
 * Offset such that `Date.UTC(local clock) - offset` is the real UTC instant.
 */
export function timeZoneOffsetMs(date: Date, timeZone: string): number | null {
  const parts = zonedParts(date, timeZone);
  if (!parts) return null;
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

export function zonedTimeToUtc(local: LocalDateTime, timeZone: string): Date | null {
  if (!isValidTimeZone(timeZone)) return null;
  const guess = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  const offset1 = timeZoneOffsetMs(new Date(guess), timeZone);
  if (offset1 === null) return null;
  let utc = guess - offset1;
  const offset2 = timeZoneOffsetMs(new Date(utc), timeZone);
  if (offset2 === null) return null;
  if (offset2 !== offset1) utc = guess - offset2;
  return new Date(utc);
}

/** Add calendar days in `timeZone`, keeping the local clock time. */
export function addCalendarDays(date: Date, days: number, timeZone: string): Date | null {
  if (!Number.isInteger(days)) return null;
  const parts = zonedParts(date, timeZone);
  if (!parts) return null;
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return zonedTimeToUtc(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
    },
    timeZone,
  );
}
