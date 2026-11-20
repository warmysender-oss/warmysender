import { describe, expect, it } from "vitest";
import { HARD_MAX_DAILY_CAP } from "./constants.js";
import {
  clampDailyCap,
  countSentOnLocalDay,
  effectiveDailyCap,
  rampDayNumber,
  underDailyCap,
} from "./caps.js";
import { localYmd } from "./time.js";

describe("daily cap and ramp", () => {
  it("clamps to the hard max of 50 and floors fractional caps", () => {
    expect(clampDailyCap(30)).toBe(30);
    expect(clampDailyCap(50)).toBe(HARD_MAX_DAILY_CAP);
    expect(clampDailyCap(51)).toBe(50);
    expect(clampDailyCap(10_000)).toBe(50);
    expect(clampDailyCap(30.9)).toBe(30);
    expect(clampDailyCap(0)).toBe(0);
    expect(clampDailyCap(-4)).toBe(0);
    expect(clampDailyCap(Number.NaN)).toBeNull();
    expect(clampDailyCap(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("uses 10, then 20, then the mailbox cap, and never above either limit", () => {
    expect(effectiveDailyCap(30, 1)).toBe(10);
    expect(effectiveDailyCap(30, 7)).toBe(10);
    expect(effectiveDailyCap(30, 8)).toBe(20);
    expect(effectiveDailyCap(30, 14)).toBe(20);
    expect(effectiveDailyCap(30, 15)).toBe(30);
    expect(effectiveDailyCap(15, 10)).toBe(15);
    expect(effectiveDailyCap(5, 1)).toBe(5);
    expect(effectiveDailyCap(100, 3)).toBe(10);
    expect(effectiveDailyCap(100, 30)).toBe(50);
    expect(effectiveDailyCap(0, 30)).toBe(0);
    expect(effectiveDailyCap(Number.NaN, 30)).toBeNull();
  });

  it("numbers ramp day 1 as the start date and keeps day 1 before that date", () => {
    expect(rampDayNumber("2026-01-15", "2026-01-15")).toBe(1);
    expect(rampDayNumber("2026-01-09", "2026-01-15")).toBe(7);
    expect(rampDayNumber("2026-01-08", "2026-01-15")).toBe(8);
    expect(rampDayNumber("2026-01-02", "2026-01-15")).toBe(14);
    expect(rampDayNumber("2026-01-01", "2026-01-15")).toBe(15);
    expect(rampDayNumber("2026-02-01", "2026-01-15")).toBe(1);
    expect(rampDayNumber("2026-02-31", "2026-01-15")).toBeNull();
  });

  it("resets the sent count at local midnight", () => {
    const zone = "America/Los_Angeles";
    const lateYesterday = new Date("2026-01-15T07:30:00.000Z");
    const justAfterMidnight = new Date("2026-01-15T08:30:00.000Z");
    expect(countSentOnLocalDay([lateYesterday], justAfterMidnight, zone)).toBe(0);
    expect(countSentOnLocalDay([lateYesterday], lateYesterday, zone)).toBe(1);
    expect(countSentOnLocalDay([justAfterMidnight], justAfterMidnight, zone)).toBe(1);
    expect(underDailyCap(0, 10)).toBe(true);
    expect(underDailyCap(10, 10)).toBe(false);
  });

  it("does not advance the ramp day before local midnight", () => {
    const stillPreviousDay = new Date("2026-01-15T07:30:00.000Z");
    const localStart = new Date("2026-01-15T08:00:00.000Z");
    expect(localYmd(stillPreviousDay, "America/Los_Angeles")).toBe("2026-01-14");
    expect(rampDayNumber("2026-01-15", "2026-01-14")).toBe(1);
    expect(localYmd(localStart, "America/Los_Angeles")).toBe("2026-01-15");
    expect(rampDayNumber("2026-01-15", "2026-01-15")).toBe(1);
    expect(rampDayNumber("2026-01-15", "2026-01-16")).toBe(2);
  });
});
