import { describe, expect, it } from "vitest";
import { planPause, planStart } from "./enroll.js";
import { launchCheck } from "./launch-check.js";

const contacts = [
  { id: "con_1", email: "jane@harbor-dental.test", status: "active", suppressed: false },
  { id: "con_2", email: "sam@harbor-dental.test", status: "active", suppressed: true },
  { id: "con_3", email: "bea@harbor-dental.test", status: "replied", suppressed: false },
  { id: "con_1", email: "jane@harbor-dental.test", status: "active", suppressed: false },
];

const openIssues = launchCheck({
  steps: [
    {
      position: 1,
      subject: "Hello",
      body: "Hi\n{{unsubscribe_link}}",
      delayDays: 0,
      contentType: "text",
    },
  ],
  mailboxes: [{ id: "mbx_1", address: "ada@studio.test", paused: false }],
  contacts,
});

describe("planStart", () => {
  it("flips a draft to running and enrolls each sendable contact once", () => {
    const plan = planStart({
      state: "draft",
      contacts,
      existingEnrollments: [],
      issues: openIssues,
      nowIso: "2026-11-20T12:00:00.000Z",
    });
    expect(plan).toEqual({
      ok: true,
      state: "running",
      warnings: [],
      enrollments: [
        {
          contactId: "con_1",
          status: "active",
          currentStep: 1,
          nextSendAt: "2026-11-20T12:00:00.000Z",
          mailboxId: null,
        },
      ],
    });
  });

  it("does not create a second enrollment when a paused campaign is started again", () => {
    const plan = planStart({
      state: "paused",
      contacts,
      existingEnrollments: [{ contactId: "con_1" }],
      issues: openIssues,
      nowIso: "2026-11-20T13:00:00.000Z",
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.enrollments).toEqual([]);
  });

  it("refuses to start when the launch check found a blocking problem", () => {
    const issues = launchCheck({
      steps: [
        {
          position: 1,
          subject: "",
          body: "Hi {{unsubscribe_link}}",
          delayDays: 0,
          contentType: "text",
        },
      ],
      mailboxes: [],
      contacts,
    });
    const plan = planStart({
      state: "draft",
      contacts,
      existingEnrollments: [],
      issues,
      nowIso: "2026-11-20T12:00:00.000Z",
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toBe("Add at least one mailbox before launching.");
  });

  it("does not start a completed campaign", () => {
    const plan = planStart({
      state: "completed",
      contacts,
      existingEnrollments: [],
      issues: openIssues,
      nowIso: "2026-11-20T12:00:00.000Z",
    });
    expect(plan.ok).toBe(false);
  });
});

describe("planPause", () => {
  it("only flips a running campaign to paused", () => {
    expect(planPause("running")).toEqual({ ok: true, state: "paused" });
    expect(planPause("draft").ok).toBe(false);
    expect(planPause("paused").ok).toBe(false);
    expect(planPause("completed").ok).toBe(false);
  });
});
