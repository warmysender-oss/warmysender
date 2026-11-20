import { describe, expect, it } from "vitest"
import { isInsideSendingWindow, parseSendingWindow } from "./window.js"

const windowResult = parseSendingWindow({
  days: ["mon", "tue", "wed", "thu", "fri"],
  windowStart: "09:00",
  windowEnd: "17:00",
  timeZone: "America/Los_Angeles",
})
if (!windowResult.ok) throw new Error("fixture window should parse")
const sendingWindow = windowResult.value

describe("sending window", () => {
  it("includes weekday minutes inside the window and excludes the end minute", () => {
    expect(isInsideSendingWindow(new Date("2026-01-05T17:30:00.000Z"), sendingWindow)).toBe(true)
    expect(isInsideSendingWindow(new Date("2026-01-05T16:30:00.000Z"), sendingWindow)).toBe(false)
    expect(isInsideSendingWindow(new Date("2026-01-06T00:59:00.000Z"), sendingWindow)).toBe(true)
    expect(isInsideSendingWindow(new Date("2026-01-06T01:00:00.000Z"), sendingWindow)).toBe(false)
  })

  it("excludes Sunday in the mailbox time zone", () => {
    expect(isInsideSendingWindow(new Date("2026-01-04T18:00:00.000Z"), sendingWindow)).toBe(false)
  })

  it("rejects an overnight window and an unknown time zone", () => {
    expect(parseSendingWindow({
      days: ["mon"],
      windowStart: "22:00",
      windowEnd: "06:00",
      timeZone: "UTC",
    }).ok).toBe(false)
    expect(parseSendingWindow({
      days: [],
      windowStart: "09:00",
      windowEnd: "17:00",
      timeZone: "Not/AZone",
    }).ok).toBe(false)
  })
})
