import { describe, expect, it } from "vitest";
import { isInsideWindow, minuteOfDay } from "./window.js";

describe("sending window", () => {
  it("is inclusive at the start and exclusive at the end", () => {
    expect(isInsideWindow(9 * 60, "09:00", "17:00")).toBe(true);
    expect(isInsideWindow(16 * 60 + 59, "09:00", "17:00")).toBe(true);
    expect(isInsideWindow(17 * 60, "09:00", "17:00")).toBe(false);
    expect(isInsideWindow(8 * 60 + 59, "09:00", "17:00")).toBe(false);
  });

  it("wraps an overnight window and treats equal bounds as the whole day", () => {
    expect(isInsideWindow(23 * 60, "22:00", "06:00")).toBe(true);
    expect(isInsideWindow(5 * 60 + 59, "22:00", "06:00")).toBe(true);
    expect(isInsideWindow(6 * 60, "22:00", "06:00")).toBe(false);
    expect(isInsideWindow(12 * 60, "22:00", "06:00")).toBe(false);
    expect(isInsideWindow(3 * 60, "00:00", "00:00")).toBe(true);
  });

  it("rejects a clock that is not HH:mm", () => {
    expect(minuteOfDay("9:00")).toBeNull();
    expect(minuteOfDay("24:00")).toBeNull();
    expect(minuteOfDay("17:60")).toBeNull();
    expect(isInsideWindow(0, "09:00", "nope")).toBeNull();
  });
});
