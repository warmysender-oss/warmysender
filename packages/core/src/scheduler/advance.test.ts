import { describe, expect, it } from "vitest";
import { advanceEnrollment } from "./advance.js";

describe("advanceEnrollment", () => {
  it("completes the enrollment on the last step", () => {
    expect(
      advanceEnrollment({
        sentAt: new Date("2026-01-15T15:00:00.000Z"),
        timeZone: "UTC",
        nextStep: null,
      }),
    ).toEqual({ status: "completed" });
  });

  it("schedules the next step on the same local clock after the delay", () => {
    const sentAt = new Date("2026-01-15T15:00:00.000Z");
    expect(advanceEnrollment({ sentAt, timeZone: "UTC", nextStep: { stepNumber: 2, delayDays: 0 } })).toEqual({
      status: "active",
      stepNumber: 2,
      nextSendAt: sentAt,
    });
    const twoDays = advanceEnrollment({
      sentAt,
      timeZone: "America/New_York",
      nextStep: { stepNumber: 2, delayDays: 2 },
    });
    expect(twoDays).toMatchObject({ status: "active", stepNumber: 2 });
    if (twoDays.status === "active") {
      expect(twoDays.nextSendAt.toISOString()).toBe("2026-01-17T15:00:00.000Z");
    }
  });

  it("stops the enrollment when the delay is not a whole number of days", () => {
    expect(
      advanceEnrollment({
        sentAt: new Date("2026-01-15T15:00:00.000Z"),
        timeZone: "UTC",
        nextStep: { stepNumber: 2, delayDays: -1 },
      }),
    ).toEqual({ status: "stopped", reason: "invalid_step_delay" });
  });
});
