import { describe, expect, it } from "vitest";
import { enforcedGapMinutes, gapElapsed, pickGapMinutes } from "./gap.js";

describe("random gap", () => {
  it("stays inside the inclusive min/max range for the ends of the rng", () => {
    expect(pickGapMinutes(4, 9, () => 0)).toBe(4);
    expect(pickGapMinutes(4, 9, () => 0.999999)).toBe(9);
    expect(pickGapMinutes(4, 4, () => 0.5)).toBe(4);
    const seen = new Set<number>();
    for (let i = 0; i < 6; i += 1) {
      seen.add(pickGapMinutes(4, 9, () => i / 6));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it("refuses a gap that could be turned off", () => {
    expect(() => pickGapMinutes(0, 9, () => 0)).toThrow();
    expect(() => pickGapMinutes(5, 4, () => 0)).toThrow();
    expect(() => pickGapMinutes(4, 9, () => 1)).toThrow();
  });

  it("is elapsed exactly at the boundary and not one millisecond earlier", () => {
    const last = new Date("2026-01-15T12:00:00.000Z");
    expect(gapElapsed(null, last, 4)).toBe(true);
    expect(gapElapsed(last, new Date(last.getTime() + 4 * 60_000 - 1), 4)).toBe(false);
    expect(gapElapsed(last, new Date(last.getTime() + 4 * 60_000), 4)).toBe(true);
  });

  it("never waits less than the configured minimum", () => {
    const sent = [new Date("2026-01-15T12:00:00.000Z")];
    expect(
      enforcedGapMinutes({
        sentAtTimes: sent,
        minGapMinutes: 4,
        maxGapMinutes: 9,
        nextGapMinutes: 1,
      }),
    ).toBe(4);
    expect(
      enforcedGapMinutes({
        sentAtTimes: sent,
        minGapMinutes: 4,
        maxGapMinutes: 9,
        nextGapMinutes: null,
      }),
    ).toBe(9);
    expect(
      enforcedGapMinutes({
        sentAtTimes: [],
        minGapMinutes: 4,
        maxGapMinutes: 9,
        nextGapMinutes: null,
      }),
    ).toBe(0);
    expect(
      enforcedGapMinutes({
        sentAtTimes: sent,
        minGapMinutes: 4,
        maxGapMinutes: 9,
        nextGapMinutes: 30,
      }),
    ).toBe(30);
  });
});
