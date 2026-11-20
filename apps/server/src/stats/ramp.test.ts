import { describe, expect, it } from "vitest";
import { effectiveDailyCap } from "@warmysender/core";
import { localIsoDate, rampPhase } from "./ramp.js";
import { mailboxDayStats } from "./stats.js";

describe("mailbox ramp card", () => {
  it("uses the core ramp helper for the cap and the label", () => {
    const core = effectiveDailyCap({
      configuredCap: 30,
      rampStartedOn: "2026-11-18",
      today: "2026-11-20",
    });
    const stats = mailboxDayStats({
      mailboxId: "mb-1",
      email: "alex@harbor-dental.test",
      configuredCap: 30,
      rampStartedOn: "2026-11-18",
      today: "2026-11-20",
      sentToday: 4,
      health: "healthy",
      paused: false,
    });
    expect(stats.rampDay).toBe(core.rampDay);
    expect(stats.effectiveCap).toBe(core.cap);
    expect(stats.rampLabel).toBe(core.label);
    expect(stats.rampPhase).toBe(rampPhase(core.rampDay));
  });

  it("formats a calendar date in the mailbox timezone", () => {
    expect(localIsoDate(new Date("2026-11-20T23:30:00.000Z"), "America/New_York")).toBe("2026-11-20");
    expect(localIsoDate(new Date("2026-11-21T03:30:00.000Z"), "America/Los_Angeles")).toBe("2026-11-20");
    expect(() => localIsoDate(new Date("2026-11-20T00:00:00.000Z"), "Not/AZone")).toThrow(/Invalid time zone/);
  });
});
