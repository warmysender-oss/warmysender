import { WEEKDAYS, type Weekday } from "./types.js"

export const DEFAULT_SENDING_DAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri"]
export const DEFAULT_WINDOW_START = "09:00"
export const DEFAULT_WINDOW_END = "17:00"
export const DEFAULT_TIME_ZONE = "UTC"

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/

export type ClockResult = { ok: true; minutes: number } | { ok: false; message: string }

export function parseClock(value: unknown): ClockResult {
  if (typeof value !== "string") {
    return { ok: false, message: "Enter a time as HH:MM." }
  }
  const match = CLOCK.exec(value)
  if (!match) {
    return { ok: false, message: "Enter a time as HH:MM using 24-hour time." }
  }
  return { ok: true, minutes: Number(match[1]) * 60 + Number(match[2]) }
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0)
    return true
  } catch {
    return false
  }
}

export type SendingWindow = {
  days: Weekday[]
  startMinute: number
  endMinute: number
  timeZone: string
}

export function parseSendingWindow(input: {
  days: readonly string[]
  windowStart: unknown
  windowEnd: unknown
  timeZone: unknown
}): { ok: true; value: SendingWindow } | { ok: false; errors: { field: string; message: string }[] } {
  const errors: { field: string; message: string }[] = []
  const days: Weekday[] = []
  const seen = new Set<Weekday>()
  for (const day of input.days) {
    if (!isWeekday(day)) {
      errors.push({ field: "sendingDays", message: "Sending days must be mon, tue, wed, thu, fri, sat, or sun." })
      break
    }
    if (!seen.has(day)) {
      seen.add(day)
      days.push(day)
    }
  }
  if (input.days.length === 0) {
    errors.push({ field: "sendingDays", message: "Pick at least one sending day." })
  }
  const start = parseClock(input.windowStart)
  const end = parseClock(input.windowEnd)
  if (!start.ok) errors.push({ field: "windowStart", message: start.message })
  if (!end.ok) errors.push({ field: "windowEnd", message: end.message })
  if (start.ok && end.ok && end.minutes <= start.minutes) {
    errors.push({
      field: "windowEnd",
      message: "The window must end after it starts. Overnight windows are not supported.",
    })
  }
  if (typeof input.timeZone !== "string" || !isValidTimeZone(input.timeZone)) {
    errors.push({ field: "timeZone", message: "Choose a valid IANA time zone, such as America/New_York." })
  }
  if (errors.length > 0 || !start.ok || !end.ok || typeof input.timeZone !== "string") {
    return { ok: false, errors }
  }
  return {
    ok: true,
    value: {
      days,
      startMinute: start.minutes,
      endMinute: end.minutes,
      timeZone: input.timeZone,
    },
  }
}

/**
 * Start is inclusive and end is exclusive, in the mailbox time zone.
 * Monday 09:00–17:00 includes 16:59 and excludes 17:00 and Sunday.
 */
export function isInsideSendingWindow(instant: Date, window: SendingWindow): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: window.timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant)
  const weekday = parts.find((item) => item.type === "weekday")?.value
  const hour = parts.find((item) => item.type === "hour")?.value
  const minute = parts.find((item) => item.type === "minute")?.value
  if (!weekday || hour === undefined || minute === undefined) return false
  const day = SHORT_WEEKDAY[weekday]
  if (!day || !window.days.includes(day)) return false
  let hourNumber = Number(hour)
  if (hourNumber === 24) hourNumber = 0
  const minutes = hourNumber * 60 + Number(minute)
  return minutes >= window.startMinute && minutes < window.endMinute
}

const SHORT_WEEKDAY: Record<string, Weekday> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
}

function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value)
}
