import { describe, expect, it } from "vitest";
import { addCalendarDays, localYmd, zonedParts } from "./time.js";

describe("mailbox-local time", () => {
  it("keeps the local clock time when adding calendar days across DST", () => {
    const beforeSpring = new Date("2026-03-07T15:00:00.000Z");
    const afterSpring = addCalendarDays(beforeSpring, 1, "America/New_York");
    expect(afterSpring?.toISOString()).toBe("2026-03-08T14:00:00.000Z");
    expect(zonedParts(afterSpring!, "America/New_York")).toMatchObject({
      hour: 10,
      minute: 0,
      day: 8,
    });

    const beforeFall = new Date("2026-10-31T14:00:00.000Z");
    const afterFall = addCalendarDays(beforeFall, 1, "America/New_York");
    expect(afterFall?.toISOString()).toBe("2026-11-01T15:00:00.000Z");
    expect(zonedParts(afterFall!, "America/New_York")).toMatchObject({
      hour: 10,
      minute: 0,
      day: 1,
    });
  });

  it("rejects a timezone it cannot resolve", () => {
    expect(localYmd(new Date(), "Not/AZone")).toBeNull();
    expect(addCalendarDays(new Date(), 1, "Not/AZone")).toBeNull();
  });
});
