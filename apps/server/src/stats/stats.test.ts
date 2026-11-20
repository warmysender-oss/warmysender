import { describe, expect, it } from "vitest";
import { campaignStats, countSentOnLocalDay, mailboxDayStats, type StatsData } from "./stats.js";

function data(): StatsData {
  return {
    outbound: [
      { campaignId: "camp-1", stepId: "step-1", contactId: "jane", mailboxId: "mb-1", sentAt: "2026-11-20T11:00:00.000Z", status: "sent" },
      { campaignId: "camp-1", stepId: "step-1", contactId: "sam", mailboxId: "mb-1", sentAt: "2026-11-20T12:00:00.000Z", status: "sent" },
      { campaignId: "camp-1", stepId: "step-2", contactId: "jane", mailboxId: "mb-1", sentAt: "2026-11-22T11:00:00.000Z", status: "sent" },
      { campaignId: "camp-1", stepId: "step-2", contactId: "sam", mailboxId: "mb-1", sentAt: "2026-11-22T12:00:00.000Z", status: "failed" },
      { campaignId: "camp-2", stepId: "other", contactId: "ada", mailboxId: "mb-1", sentAt: "2026-11-20T11:00:00.000Z", status: "sent" },
    ],
    inbound: [
      { campaignId: "camp-1", stepId: "step-1", contactId: "jane", kind: "reply" },
      { campaignId: "camp-1", stepId: "step-1", contactId: "jane", kind: "reply" },
      { campaignId: "camp-1", stepId: "step-1", contactId: "sam", kind: "auto_reply" },
      { campaignId: "camp-1", stepId: "step-2", contactId: "sam", kind: "bounce" },
      { campaignId: "camp-1", stepId: "step-2", contactId: "sam", kind: "bounce" },
      { campaignId: "camp-1", stepId: "step-1", contactId: "ada", kind: "delivery_delay" },
      { campaignId: "camp-1", stepId: null, contactId: "lee", kind: "reply" },
      { campaignId: "camp-2", stepId: "other", contactId: "ada", kind: "reply" },
    ],
    unsubscribes: [
      { campaignId: "camp-1", stepPosition: 2, contactId: "sam" },
      { campaignId: "camp-1", stepPosition: 2, contactId: "sam" },
      { campaignId: "camp-1", stepPosition: null, contactId: "lee" },
    ],
    enrollments: [
      { campaignId: "camp-1", contactId: "jane", currentStep: 2, status: "active" },
      { campaignId: "camp-1", contactId: "sam", currentStep: 1, status: "stopped" },
      { campaignId: "camp-1", contactId: "lee", currentStep: 1, status: "active" },
      { campaignId: "camp-2", contactId: "ada", currentStep: 1, status: "active" },
    ],
  };
}

describe("campaignStats", () => {
  it("counts sent, distinct real replies, bounces, unsubscribes and active enrollments", () => {
    const stats = campaignStats("camp-1", [
      { id: "step-2", position: 2 },
      { id: "step-1", position: 1 },
    ], data());
    expect(stats.sent).toBe(3);
    expect(stats.replies).toBe(2);
    expect(stats.replyRate).toBeCloseTo(2 / 3);
    expect(stats.bounces).toBe(1);
    expect(stats.unsubscribes).toBe(2);
    expect(stats.stillInSequence).toBe(2);
    expect(stats.steps.map((step) => step.stepId)).toEqual(["step-1", "step-2"]);
  });

  it("keeps another campaign out of the totals", () => {
    const stats = campaignStats("camp-1", [{ id: "step-1", position: 1 }], data());
    expect(stats.sent).toBe(3);
    expect(stats.replies).toBe(2);
  });

  it("attributes a step by its own rows", () => {
    const stats = campaignStats("camp-1", [
      { id: "step-1", position: 1 },
      { id: "step-2", position: 2 },
    ], data());
    const step1 = stats.steps[0];
    const step2 = stats.steps[1];
    expect(step1?.sent).toBe(2);
    expect(step1?.replies).toBe(1);
    expect(step1?.replyRate).toBeCloseTo(0.5);
    expect(step1?.bounces).toBe(0);
    expect(step1?.stillInSequence).toBe(1);
    expect(step2?.sent).toBe(1);
    expect(step2?.replies).toBe(0);
    expect(step2?.bounces).toBe(1);
    expect(step2?.unsubscribes).toBe(1);
    expect(step2?.stillInSequence).toBe(1);
  });

  it("returns a zero reply rate when nothing was sent", () => {
    const stats = campaignStats("camp-empty", [], {
      outbound: [],
      inbound: [],
      unsubscribes: [],
      enrollments: [],
    });
    expect(stats.replyRate).toBe(0);
    expect(stats.sent).toBe(0);
  });
});

describe("countSentOnLocalDay", () => {
  it("counts successful sends on the mailbox-local date", () => {
    const messages = [
      { mailboxId: "mb-1", sentAt: "2026-11-21T03:30:00.000Z", status: "sent" as const },
      { mailboxId: "mb-1", sentAt: "2026-11-21T12:00:00.000Z", status: "sent" as const },
      { mailboxId: "mb-1", sentAt: "2026-11-21T03:30:00.000Z", status: "failed" as const },
      { mailboxId: "mb-2", sentAt: "2026-11-21T03:30:00.000Z", status: "sent" as const },
    ];
    expect(countSentOnLocalDay(messages, "mb-1", "2026-11-20", "America/Los_Angeles")).toBe(1);
  });
});

describe("mailboxDayStats", () => {
  it("reports sent today against the ramp cap", () => {
    const stats = mailboxDayStats({
      mailboxId: "mb-1",
      email: "alex@harbor-dental.test",
      configuredCap: 30,
      rampStartedOn: "2026-11-18",
      today: "2026-11-20",
      sentToday: 12,
      health: "ok",
      paused: false,
    });
    expect(stats.rampDay).toBe(3);
    expect(stats.effectiveCap).toBe(10);
    expect(stats.remaining).toBe(0);
    expect(stats.overCap).toBe(true);
    expect(stats.rampLabel).toBe("Day 3 of ramp: 10 a day");
    expect(stats.health).toBe("ok");
  });
});
