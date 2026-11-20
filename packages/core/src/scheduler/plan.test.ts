import { describe, expect, it } from "vitest";
import { candidate, mailbox, NOON } from "./fixture.js";
import { planSendTick } from "./plan.js";
import type { SendCandidate } from "./types.js";

type MailboxCase = {
  now?: string;
  sendingDays?: readonly number[];
  sent?: number;
  gapMinutes?: number;
  paused?: boolean;
  timezone?: string;
  suppress?: boolean;
};

describe("one send at a time and re-checks", () => {
  it("sends one email per mailbox per minute and can send from two mailboxes", () => {
    const first = candidate({ dueAt: new Date("2026-01-15T11:00:00.000Z") });
    const second = candidate({
      enrollmentId: "enr_2",
      contactId: "ctc_2",
      contactEmail: "sam@harbor-dental.test",
      dueAt: NOON,
    });
    const plan = planSendTick({
      now: NOON,
      mailboxes: [mailbox(), mailbox({ id: "mbx_2" })],
      candidates: [second, first, candidate({ mailboxId: "mbx_2", enrollmentId: "enr_3", contactId: "ctc_3", contactEmail: "pat@other.test" })],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(plan.sends.map((send) => send.enrollmentId).sort()).toEqual(["enr_1", "enr_3"]);
    expect(plan.skips.map((skip) => skip.reason)).toEqual(["one_at_a_time"]);
    expect(plan.skips[0]?.log).toContain("reason=one_at_a_time");
  });

  it("does not start a second send while one is in flight", () => {
    const plan = planSendTick({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [candidate()],
      suppressions: [],
      inFlightMailboxIds: ["mbx_1"],
    });
    expect(plan.sends).toHaveLength(0);
    expect(plan.skips[0]?.reason).toBe("mailbox_busy");
  });

  it("skips a suppressed contact and still sends the next eligible one", () => {
    const plan = planSendTick({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [
        candidate({ contactEmail: "jane@harbor-dental.test" }),
        candidate({
          enrollmentId: "enr_2",
          contactId: "ctc_2",
          contactEmail: "sam@other.test",
        }),
      ],
      suppressions: [{ kind: "email", value: "jane@harbor-dental.test" }],
      inFlightMailboxIds: [],
    });
    expect(plan.sends.map((send) => send.enrollmentId)).toEqual(["enr_2"]);
    expect(plan.skips[0]?.reason).toBe("suppressed");
  });

  it.each<[string, MailboxCase, Partial<SendCandidate>]>([
    ["outside_window", { now: "2026-01-15T08:00:00.000Z" }, {}],
    ["not_sending_day", { now: "2026-01-18T12:00:00.000Z", sendingDays: [1, 2, 3, 4, 5] }, {}],
    ["daily_cap", { sent: 30 }, {}],
    ["gap_not_elapsed", { sent: 1, gapMinutes: 9 }, {}],
    ["mailbox_paused", { paused: true }, {}],
    ["campaign_not_running", {}, { campaignStatus: "paused" }],
    ["enrollment_not_active", {}, { enrollmentStatus: "stopped" }],
    ["not_due", {}, { dueAt: new Date("2026-01-15T13:00:00.000Z") }],
    ["contact_replied", {}, { contactStatus: "replied" }],
    ["contact_bounced", {}, { contactStatus: "bounced" }],
    ["contact_unsubscribed", {}, { contactStatus: "unsubscribed" }],
    ["contact_not_active", {}, { contactStatus: "risky" }],
    ["suppressed", { suppress: true }, {}],
    ["invalid_schedule", { timezone: "Mars/Base" }, {}],
    ["invalid_recipient", {}, { contactEmail: "not-an-email" }],
    ["invalid_unsubscribe_url", {}, { publicUrl: "mailto:ada@harbor-dental.test" }],
    ["missing_subject", {}, { stepSubject: "  " }],
    ["missing_thread", {}, { stepNumber: 2, stepSubject: "Own subject" }],
    ["unknown_mailbox", {}, { mailboxId: "missing" }],
    ["send_failed", {}, { attempts: 3 }],
    ["retry_waiting", {}, { attempts: 1, retryAt: new Date("2026-01-15T12:05:00.000Z") }],
  ])(
    "skip reason %s",
    (reason: string, mailboxOverrides: MailboxCase, candidateOverrides: Partial<SendCandidate>) => {
    const now = new Date(mailboxOverrides.now ?? NOON.toISOString());
    const sentCount = mailboxOverrides.sent ?? 0;
    const sentAt = new Date(now.getTime() - 60_000);
    const plan = planSendTick({
      now,
      mailboxes: [
        mailbox({
          timezone: mailboxOverrides.timezone ?? "UTC",
          sendingDays: mailboxOverrides.sendingDays ? [...mailboxOverrides.sendingDays] : [1, 2, 3, 4, 5, 6, 7],
          paused: mailboxOverrides.paused ?? false,
          sentAtTimes: Array.from({ length: sentCount }, () => sentAt),
          nextGapMinutes: mailboxOverrides.gapMinutes ?? null,
        }),
      ],
      candidates: [candidate({ dueAt: now, ...candidateOverrides })],
      suppressions: mailboxOverrides.suppress ? [{ kind: "email", value: "jane@harbor-dental.test" }] : [],
      inFlightMailboxIds: [],
    });
    expect(plan.sends).toHaveLength(0);
    expect(plan.skips[0]?.reason).toBe(reason);
    expect(plan.skips[0]?.log.startsWith(`[send] skipped reason=${reason} `)).toBe(true);
  });

  it("uses the mailbox timezone for the window", () => {
    const inside = planSendTick({
      now: new Date("2026-01-15T14:30:00.000Z"),
      mailboxes: [mailbox({ timezone: "America/New_York" })],
      candidates: [candidate({ dueAt: new Date("2026-01-15T14:00:00.000Z") })],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(inside.sends).toHaveLength(1);

    const outside = planSendTick({
      now: new Date("2026-01-15T13:30:00.000Z"),
      mailboxes: [mailbox({ timezone: "America/New_York" })],
      candidates: [candidate({ dueAt: new Date("2026-01-15T13:00:00.000Z") })],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(outside.skips[0]?.reason).toBe("outside_window");
  });

  it("rotates step 1 onto the mailbox with room under the cap", () => {
    const plan = planSendTick({
      now: NOON,
      mailboxes: [
        mailbox({ id: "mbx_b", sentAtTimes: Array.from({ length: 30 }, () => new Date("2026-01-15T11:00:00.000Z")) }),
        mailbox({ id: "mbx_a" }),
      ],
      candidates: [candidate({ mailboxId: null, mailboxChoices: ["mbx_b", "mbx_a"] })],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(plan.sends.map((send) => send.mailboxId)).toEqual(["mbx_a"]);
  });

  it("sends on Sunday only when Sunday is a sending day", () => {
    const sunday = new Date("2026-01-18T12:00:00.000Z");
    const closed = planSendTick({
      now: sunday,
      mailboxes: [mailbox({ sendingDays: [1, 2, 3, 4, 5] })],
      candidates: [candidate({ dueAt: sunday })],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(closed.skips[0]?.reason).toBe("not_sending_day");
    const open = planSendTick({
      now: sunday,
      mailboxes: [mailbox({ sendingDays: [7] })],
      candidates: [candidate({ dueAt: sunday })],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(open.sends).toHaveLength(1);
  });

  it("does not retry a step that failed without a scheduled time", () => {
    const plan = planSendTick({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [candidate({ attempts: 1, retryAt: null })],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(plan.skips[0]?.reason).toBe("send_failed");
  });
});
