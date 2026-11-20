import { describe, expect, it } from "vitest";
import { firstRunView } from "./first-run.js";

const empty = {
  mailboxCount: 0,
  dnsCheckedMailboxCount: 0,
  contactCount: 0,
  campaignCount: 0,
  demoCampaignAvailable: false,
};

describe("firstRunView", () => {
  it("starts at connect a mailbox", () => {
    const view = firstRunView(empty);
    expect(view.steps.map((step) => step.id)).toEqual(["connect_mailbox", "dns_check", "import_csv", "first_campaign"]);
    expect(view.nextStepId).toBe("connect_mailbox");
    expect(view.completedCount).toBe(0);
    expect(view.demo).toBeNull();
  });

  it("moves to the DNS check once a mailbox is connected", () => {
    const view = firstRunView({ ...empty, mailboxCount: 1 });
    expect(view.steps[0]?.done).toBe(true);
    expect(view.nextStepId).toBe("dns_check");
  });

  it("keeps the first incomplete step even when a later step is done", () => {
    const view = firstRunView({ ...empty, contactCount: 4, campaignCount: 1 });
    expect(view.nextStepId).toBe("connect_mailbox");
    expect(view.steps[2]?.done).toBe(true);
    expect(view.steps[3]?.done).toBe(true);
  });

  it("finishes when every step is done", () => {
    const view = firstRunView({
      mailboxCount: 1,
      dnsCheckedMailboxCount: 1,
      contactCount: 2,
      campaignCount: 1,
      demoCampaignAvailable: true,
    });
    expect(view.nextStepId).toBeNull();
    expect(view.completedCount).toBe(4);
    expect(view.demo).toEqual({
      title: "Explore the demo campaign",
      body: "A seeded campaign with .test contacts is ready to click through.",
    });
  });

  it("does not treat a negative count as done", () => {
    const view = firstRunView({ ...empty, mailboxCount: -1 });
    expect(view.nextStepId).toBe("connect_mailbox");
  });
});
