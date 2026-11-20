/**
 * Safety limits are code. Nothing in the request path can raise these.
 * Spec §1.3 and §3.2: daily cap default 30, hard max 50.
 */

export const DAILY_CAP_DEFAULT = 30
export const DAILY_CAP_HARD_MIN = 1
export const DAILY_CAP_HARD_MAX = 50

export const GAP_DEFAULT_MIN_MINUTES = 4
export const GAP_DEFAULT_MAX_MINUTES = 9
/** A zero gap would remove the pause between sends. */
export const GAP_HARD_MIN_MINUTES = 1
/** Matches the mailboxes gap check: a gap longer than a day is rejected. */
export const GAP_HARD_MAX_MINUTES = 1440

export const SIGNATURE_MAX_CHARS = 10_000
export const FROM_NAME_MAX_CHARS = 200

export function parseStrictInt(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) return null
    return value
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)) return null
    return parsed
  }
  return null
}

export type LimitResult = { ok: true; value: number } | { ok: false; message: string }

export function validateDailyCap(value: unknown): LimitResult {
  const parsed = parseStrictInt(value)
  if (parsed === null) {
    return { ok: false, message: "Daily cap must be a whole number." }
  }
  if (parsed < DAILY_CAP_HARD_MIN) {
    return {
      ok: false,
      message: `Daily cap must be at least ${DAILY_CAP_HARD_MIN}. Pause the mailbox to stop sending.`,
    }
  }
  if (parsed > DAILY_CAP_HARD_MAX) {
    return {
      ok: false,
      message: `Daily cap cannot be higher than ${DAILY_CAP_HARD_MAX}.`,
    }
  }
  return { ok: true, value: parsed }
}

export function requireValidDailyCap(value: number): number {
  const result = validateDailyCap(value)
  if (!result.ok) {
    throw new Error(result.message)
  }
  return result.value
}

export function validateGapPair(minValue: unknown, maxValue: unknown):
  | { ok: true; minGapMinutes: number; maxGapMinutes: number }
  | { ok: false; errors: { field: string; message: string }[] } {
  const errors: { field: string; message: string }[] = []
  const min = parseStrictInt(minValue)
  const max = parseStrictInt(maxValue)
  if (min === null) {
    errors.push({ field: "minGapMinutes", message: "Minimum gap must be a whole number of minutes." })
  } else if (min < GAP_HARD_MIN_MINUTES) {
    errors.push({
      field: "minGapMinutes",
      message: `Minimum gap must be at least ${GAP_HARD_MIN_MINUTES} minute.`,
    })
  }
  if (max === null) {
    errors.push({ field: "maxGapMinutes", message: "Maximum gap must be a whole number of minutes." })
  } else if (max < GAP_HARD_MIN_MINUTES) {
    errors.push({
      field: "maxGapMinutes",
      message: `Maximum gap must be at least ${GAP_HARD_MIN_MINUTES} minute.`,
    })
  }
  if (max !== null && max > GAP_HARD_MAX_MINUTES) {
    errors.push({
      field: "maxGapMinutes",
      message: `Maximum gap cannot be more than ${GAP_HARD_MAX_MINUTES} minutes.`,
    })
  }
  if (min !== null && max !== null && max < min && !errors.some((error) => error.field === "maxGapMinutes")) {
    errors.push({
      field: "maxGapMinutes",
      message: "Maximum gap must be greater than or equal to the minimum gap.",
    })
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, minGapMinutes: min as number, maxGapMinutes: max as number }
}
