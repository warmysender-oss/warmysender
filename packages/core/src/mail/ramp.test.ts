import { describe, expect, it } from "vitest"
import { effectiveDailyCap, todayInTimeZone } from "./ramp.js"

const start = "2026-01-01"

describe("ramp math", () => {
  it("caps days 1 through 7 at 10", () => {
    const day1 = effectiveDailyCap({ configuredCap: 30, rampStartedOn: start, today: "2026-01-01" })
    const day7 = effectiveDailyCap({ configuredCap: 30, rampStartedOn: start, today: "2026-01-07" })
    expect(day1).toMatchObject({ cap: 10, rampDay: 1, inRamp: true, label: "Day 1 of ramp: 10 a day" })
    expect(day7).toMatchObject({ cap: 10, rampDay: 7, label: "Day 7 of ramp: 10 a day" })
  })

  it("caps days 8 through 14 at 20, then uses the mailbox cap", () => {
    const day8 = effectiveDailyCap({ configuredCap: 30, rampStartedOn: start, today: "2026-01-08" })
    const day14 = effectiveDailyCap({ configuredCap: 50, rampStartedOn: start, today: "2026-01-14" })
    const day15 = effectiveDailyCap({ configuredCap: 30, rampStartedOn: start, today: "2026-01-15" })
    expect(day8).toMatchObject({ cap: 20, rampDay: 8, label: "Day 8 of ramp: 20 a day" })
    expect(day14).toMatchObject({ cap: 20, rampDay: 14 })
    expect(day15).toEqual({ cap: 30, rampDay: 15, inRamp: false, label: null })
  })

  it("never exceeds the mailbox cap during the ramp", () => {
    const early = effectiveDailyCap({ configuredCap: 8, rampStartedOn: start, today: "2026-01-03" })
    const mid = effectiveDailyCap({ configuredCap: 15, rampStartedOn: start, today: "2026-01-10" })
    expect(early).toMatchObject({ cap: 8, label: "Day 3 of ramp: 8 a day" })
    expect(mid.cap).toBe(15)
  })

  it("treats a clock before the start date as day 1 and refuses a cap above 50", () => {
    expect(effectiveDailyCap({ configuredCap: 30, rampStartedOn: start, today: "2025-12-31" }).rampDay).toBe(1)
    expect(() => effectiveDailyCap({ configuredCap: 51, rampStartedOn: start, today: start })).toThrow(/50/)
  })
})

describe("mailbox-local today", () => {
  it("uses the mailbox time zone, not UTC", () => {
    const instant = new Date("2026-01-02T03:30:00.000Z")
    expect(todayInTimeZone(instant, "America/New_York")).toBe("2026-01-01")
    expect(todayInTimeZone(instant, "UTC")).toBe("2026-01-02")
  })
})
