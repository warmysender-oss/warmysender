import { requireValidDailyCap } from "./limits.js"

/** Days 1–7 send at most 10. Days 8–14 send at most 20. Then the mailbox cap. */
export const RAMP_EARLY_DAYS = 7
export const RAMP_EARLY_CAP = 10
export const RAMP_MID_DAYS = 14
export const RAMP_MID_CAP = 20

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function todayInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const year = part(parts, "year")
  const month = part(parts, "month")
  const day = part(parts, "day")
  return `${year}-${month}-${day}`
}

export function rampDayNumber(rampStartedOn: string, today: string): number {
  const start = parseIsoDate(rampStartedOn)
  const current = parseIsoDate(today)
  const diff = Math.round((current - start) / 86_400_000)
  if (diff < 0) return 1
  return diff + 1
}

export type EffectiveCap = {
  cap: number
  rampDay: number
  inRamp: boolean
  /** Present while the mailbox is still in the 14-day ramp. Example: "Day 3 of ramp: 10 a day". */
  label: string | null
}

/**
 * Effective cap is the lesser of the mailbox cap and the ramp ceiling.
 * It never exceeds the hard max, because an invalid mailbox cap throws.
 */
export function effectiveDailyCap(input: {
  configuredCap: number
  rampStartedOn: string
  today: string
}): EffectiveCap {
  const configured = requireValidDailyCap(input.configuredCap)
  const rampDay = rampDayNumber(input.rampStartedOn, input.today)
  let ceiling = configured
  let inRamp = false
  if (rampDay <= RAMP_EARLY_DAYS) {
    ceiling = RAMP_EARLY_CAP
    inRamp = true
  } else if (rampDay <= RAMP_MID_DAYS) {
    ceiling = RAMP_MID_CAP
    inRamp = true
  }
  const cap = Math.min(configured, ceiling)
  return {
    cap,
    rampDay,
    inRamp,
    label: inRamp ? `Day ${rampDay} of ramp: ${cap} a day` : null,
  }
}

function parseIsoDate(value: string): number {
  const match = ISO_DATE.exec(value)
  if (!match) {
    throw new Error("Dates must be YYYY-MM-DD.")
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = Date.UTC(year, month - 1, day)
  const check = new Date(utc)
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error("Dates must be a real calendar day.")
  }
  return utc
}

function part(parts: Intl.DateTimeFormatPart[], type: string): string {
  const found = parts.find((item) => item.type === type)
  if (!found) throw new Error(`Missing date part ${type}.`)
  return found.value
}
