import { describe, expect, it } from "vitest"
import {
  DAILY_CAP_DEFAULT,
  DAILY_CAP_HARD_MAX,
  validateDailyCap,
  validateGapPair,
} from "./limits.js"

describe("daily cap", () => {
  it("accepts the default and the hard max", () => {
    expect(validateDailyCap(DAILY_CAP_DEFAULT)).toEqual({ ok: true, value: 30 })
    expect(validateDailyCap(DAILY_CAP_HARD_MAX)).toEqual({ ok: true, value: 50 })
    expect(validateDailyCap("1")).toEqual({ ok: true, value: 1 })
  })

  it("rejects a cap above 50, below 1, or not a whole number", () => {
    expect(validateDailyCap(51).ok).toBe(false)
    expect(validateDailyCap(0).ok).toBe(false)
    expect(validateDailyCap(-3).ok).toBe(false)
    expect(validateDailyCap(30.5).ok).toBe(false)
    expect(validateDailyCap("30abc").ok).toBe(false)
    expect(validateDailyCap("51")).toMatchObject({ ok: false })
  })
})

describe("gaps", () => {
  it("accepts the default 4–9 minute gap", () => {
    expect(validateGapPair(4, 9)).toEqual({ ok: true, minGapMinutes: 4, maxGapMinutes: 9 })
  })

  it("rejects a zero gap, a max below the min, and a gap past 1440 minutes", () => {
    expect(validateGapPair(0, 9).ok).toBe(false)
    const backwards = validateGapPair(10, 4)
    expect(backwards.ok).toBe(false)
    if (!backwards.ok) {
      expect(backwards.errors.some((error) => error.field === "maxGapMinutes")).toBe(true)
    }
    expect(validateGapPair(4, 1441).ok).toBe(false)
    expect(validateGapPair(4, 1440)).toEqual({ ok: true, minGapMinutes: 4, maxGapMinutes: 1440 })
  })
})
