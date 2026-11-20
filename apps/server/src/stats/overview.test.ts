import { describe, expect, it } from "vitest";
import { statsOverview, type StatsSnapshot } from "./overview.js";

const snapshot: StatsSnapshot = {
  campaigns: [
    { id: "camp-1", name: "Intro" },
    { id: "camp-2", name: "Other" },
  ],
  steps: [
    { id: "step-1", campaignId: "camp-1", position: 1 },
    { id: "step-2", campaignId: "camp-2", position: 1 },
  ],
  data: {
    outbound: [
      { campaignId: "camp-1", stepId: "step-1", contactId: "jane", mailboxId: "mb-1", sentAt: "2026-11-20T11:00:00.000Z", status: "sent" },
      { campaignId: "camp-2", stepId: "step-2", contactId: "sam", mailboxId: "mb-1", sentAt: "2026-11-20T12:00:00.000Z", status: "sent" },
    ],
    inbound: [
      { campaignId: "camp-1", stepId: "step-1", contactId: "jane", kind: "reply" },
      { campaignId: "camp-2", stepId: "step-2", contactId: "sam", kind: "auto_reply" },
    ],
    unsubscribes: [],
    enrollments: [
      { campaignId: "camp-1", contactId: "jane", currentStep: 1, status: "active" },
    ],
  },
  mailboxes: [
    {
      mailboxId: "mb-1",
      email: "alex@harbor-dental.test",
      configuredCap: 30,
      rampStartedOn: "2026-11-18",
      today: "2026-11-20",
      sentToday: 4,
      health: "ok",
      paused: false,
    },
  ],
};

describe("statsOverview", () => {
  it("keeps each campaign's stats on that campaign", () => {
    const overview = statsOverview(snapshot);
    const intro = overview.campaigns.find((campaign) => campaign.campaignId === "camp-1");
    const other = overview.campaigns.find((campaign) => campaign.campaignId === "camp-2");
    expect(intro).toMatchObject({ name: "Intro", sent: 1, replies: 1, replyRate: 1, stillInSequence: 1 });
    expect(other).toMatchObject({ name: "Other", sent: 1, replies: 0, replyRate: 0 });
  });

  it("includes the mailbox ramp line", () => {
    const overview = statsOverview(snapshot);
    expect(overview.mailboxes[0]).toMatchObject({
      email: "alex@harbor-dental.test",
      sentToday: 4,
      effectiveCap: 10,
      rampLabel: "Day 3 of ramp: 10 a day",
    });
  });
});
