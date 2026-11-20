import { describe, expect, it } from "vitest";
import { assertDailyCap, effectiveDailyCap, localIsoDate, rampDayNumber, rampLabel } from "./ramp.js";

describe("ramp", () => {
  it("counts the start date as day 1", () => {
    expect(rampDayNumber("2026-11-20", "2026-11-20")).toBe(1);
    expect(rampDayNumber("2026-11-20", "2026-11-26")).toBe(7);
    expect(rampDayNumber("2026-11-20", "2026-11-27")).toBe(8);
    expect(rampDayNumber("2026-11-20", "2026-12-03")).toBe(14);
    expect(rampDayNumber("2026-11-20", "2026-12-04")).toBe(15);
  });

  it("caps days 1-7 at 10 and days 8-14 at 20, then uses the mailbox cap", () => {
    expect(effectiveDailyCap(30, 3)).toBe(10);
    expect(effectiveDailyCap(40, 10)).toBe(20);
    expect(effectiveDailyCap(30, 15)).toBe(30);
    expect(effectiveDailyCap(50, 20)).toBe(50);
  });

  it("does not raise a mailbox whose own cap is under the ramp cap", () => {
    expect(effectiveDailyCap(5, 3)).toBe(5);
    expect(effectiveDailyCap(5, 10)).toBe(5);
  });

  it("uses the first-week cap before the ramp start date", () => {
    expect(rampDayNumber("2026-11-20", "2026-11-19")).toBe(0);
    expect(effectiveDailyCap(30, 0)).toBe(10);
  });

  it("rejects a cap outside 1..50", () => {
    expect(() => assertDailyCap(0)).toThrow(RangeError);
    expect(() => assertDailyCap(51)).toThrow(RangeError);
    expect(() => effectiveDailyCap(30.5, 1)).toThrow(RangeError);
  });

  it("rejects a calendar date that does not exist", () => {
    expect(() => rampDayNumber("2026-02-31", "2026-03-01")).toThrow(/Invalid date/);
  });

  it("formats a calendar date in the mailbox timezone", () => {
    expect(localIsoDate(new Date("2026-11-20T23:30:00.000Z"), "America/New_York")).toBe("2026-11-20");
    expect(localIsoDate(new Date("2026-11-21T03:30:00.000Z"), "America/Los_Angeles")).toBe("2026-11-20");
    expect(() => localIsoDate(new Date("2026-11-20T00:00:00.000Z"), "Not/AZone")).toThrow(/Invalid time zone/);
  });

  it("formats the ramp line from the spec", () => {
    expect(rampLabel(3, 10)).toBe("Day 3 of ramp: 10 a day");
    expect(rampLabel(15, 30)).toBeNull();
  });
});
