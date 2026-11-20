import { describe, expect, it } from "vitest";
import { campaignStatCards, formatReplyRate, mailboxStatLine } from "./stats-cards.js";

describe("dashboard stat cards", () => {
  it("labels campaign stats in spec order", () => {
    expect(
      campaignStatCards({
        name: "Intro",
        sent: 3,
        replies: 1,
        replyRate: 1 / 3,
        bounces: 0,
        unsubscribes: 1,
        stillInSequence: 2,
      }).map((card) => card.label),
    ).toEqual(["Sent", "Replies", "Reply rate", "Bounces", "Unsubscribes", "Still in sequence"]);
  });

  it("formats the reply rate as a percent", () => {
    expect(formatReplyRate(0.5)).toBe("50.0%");
    expect(formatReplyRate(1 / 3)).toBe("33.3%");
    expect(formatReplyRate(0)).toBe("0.0%");
  });

  it("shows sent today against the effective cap and the ramp line", () => {
    expect(
      mailboxStatLine({
        email: "alex@harbor-dental.test",
        sentToday: 4,
        effectiveCap: 10,
        rampLabel: "Day 3 of ramp: 10 a day",
        health: "ok",
        paused: false,
      }),
    ).toMatchObject({
      title: "alex@harbor-dental.test",
      usage: "4 / 10 today",
      ramp: "Day 3 of ramp: 10 a day",
      paused: false,
    });
  });
});
