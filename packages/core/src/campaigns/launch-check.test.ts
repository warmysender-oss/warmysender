import { describe, expect, it } from "vitest";
import { blockingIssues, launchCheck, type LaunchStep } from "./launch-check.js";

const step = (overrides: Partial<LaunchStep> = {}): LaunchStep => ({
  position: 1,
  subject: "Hello {{first_name}}",
  body: "Hi {{first_name|there}}\n{{unsubscribe_link}}",
  delayDays: 0,
  contentType: "text",
  ...overrides,
});

const ready = {
  steps: [step(), step({ position: 2, delayDays: 3, subject: "Re: Hello" })],
  mailboxes: [{ id: "mbx_1", address: "ada@studio.test", paused: false }],
  contacts: [{ id: "con_1", email: "jane@harbor-dental.test", status: "active", suppressed: false }],
};

describe("launchCheck", () => {
  it("says nothing blocking when the campaign can launch", () => {
    expect(blockingIssues(launchCheck(ready))).toEqual([]);
  });

  it("refuses when no mailbox is selected", () => {
    const issues = launchCheck({ ...ready, mailboxes: [] });
    expect(issues.map((issue) => issue.message)).toContain("Add at least one mailbox before launching.");
    expect(issues.find((issue) => issue.code === "no_mailboxes")?.blocking).toBe(true);
  });

  it("refuses while a selected mailbox is paused", () => {
    const issues = launchCheck({
      ...ready,
      mailboxes: [{ id: "mbx_1", address: "ada@studio.test", paused: true }],
    });
    expect(issues.map((issue) => issue.message)).toContain(
      "ada@studio.test is paused. Reconnect it or remove it from this campaign before launching.",
    );
  });

  it("allows a follow-up with a blank subject so it can stay in the same thread", () => {
    const issues = launchCheck({
      ...ready,
      steps: [step(), step({ position: 2, delayDays: 2, subject: "   " })],
    });
    expect(issues.map((issue) => issue.message)).not.toContain("Step 2 needs a subject.");
    expect(blockingIssues(issues)).toEqual([]);
  });

  it("refuses an empty subject or body", () => {
    const issues = launchCheck({
      ...ready,
      steps: [step({ subject: "  ", body: "<p><br></p>", contentType: "html" })],
    });
    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(["Step 1 needs a subject.", "Step 1 needs a body."]),
    );
  });

  it("refuses when every contact is suppressed or not sendable", () => {
    const issues = launchCheck({
      ...ready,
      contacts: [
        { id: "con_1", email: "jane@harbor-dental.test", status: "active", suppressed: true },
        { id: "con_2", email: "sam@harbor-dental.test", status: "bounced", suppressed: true },
      ],
    });
    expect(issues.find((issue) => issue.code === "contacts_all_suppressed")?.blocking).toBe(true);
  });

  it("warns, and still allows launch, when a step removed the unsubscribe token", () => {
    const issues = launchCheck({
      ...ready,
      steps: [step({ body: "Hi {{first_name|there}}" })],
    });
    const warning = issues.find((issue) => issue.code === "missing_unsubscribe");
    expect(warning?.blocking).toBe(false);
    expect(warning?.message).toContain("{{unsubscribe_link}}");
    expect(blockingIssues(issues)).toEqual([]);
  });

  it("requires the first step to have no delay", () => {
    const issues = launchCheck({ ...ready, steps: [step({ delayDays: 2 })] });
    expect(issues.map((issue) => issue.message)).toContain("The first step must send with no delay.");
  });

  it("counts a contact only once when they were passed twice", () => {
    const issues = launchCheck({
      ...ready,
      contacts: [
        { id: "con_1", email: "jane@harbor-dental.test", status: "active", suppressed: true },
        { id: "con_1", email: "jane@harbor-dental.test", status: "active", suppressed: false },
      ],
    });
    expect(issues.find((issue) => issue.code === "contacts_all_suppressed")).toBeUndefined();
  });
});
