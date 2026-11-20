import { describe, expect, it } from "vitest";
import { planSendTick } from "./plan.js";
import { pickGapMinutes } from "./gap.js";
import { candidate, mailbox, NOON } from "./fixture.js";
import type { MailboxSnapshot, SendCandidate } from "./types.js";
import { applyRecipientEvent, classifyInbound } from "./recipient-events.js";
import { buildOutgoingEmail } from "../mail/send-message.js";

const minute = 60_000;

describe("spec section 6 safety rules", () => {
  it("never exceeds the daily cap, including ramp and the hard max of 50", () => {
    const ramp = simulate({
      cap: 30,
      rampStartedOn: "2026-01-15",
      gap: 4,
      from: "2026-01-15T08:50:00.000Z",
      until: "2026-01-15T11:00:00.000Z",
      windowStart: "09:00",
      windowEnd: "17:00",
      queue: 15,
    });
    expect(ramp.sent.length).toBe(10);
    expect(ramp.blockedByCap).toBeGreaterThan(0);

    const ownCap = simulate({
      cap: 30,
      rampStartedOn: "2025-01-01",
      gap: 4,
      from: "2026-01-15T08:50:00.000Z",
      until: "2026-01-15T12:00:00.000Z",
      windowStart: "09:00",
      windowEnd: "17:00",
      queue: 40,
    });
    expect(ownCap.sent.length).toBe(30);
    expect(ownCap.blockedByCap).toBeGreaterThan(0);

    const hardMax = simulate({
      cap: 500,
      rampStartedOn: "2025-01-01",
      gap: 1,
      from: "2026-01-15T00:00:00.000Z",
      until: "2026-01-15T01:05:00.000Z",
      windowStart: "00:00",
      windowEnd: "00:00",
      queue: 60,
    });
    expect(hardMax.sent.length).toBe(50);
    expect(hardMax.blockedByCap).toBeGreaterThan(0);
  });

  it("sends nothing outside the window or on a closed day", () => {
    const day = simulate({
      cap: 30,
      rampStartedOn: "2025-01-01",
      gap: 4,
      from: "2026-01-15T08:50:00.000Z",
      until: "2026-01-15T10:00:00.000Z",
      windowStart: "09:00",
      windowEnd: "17:00",
      queue: 20,
    });
    for (const sent of day.sent) {
      const minutes = sent.getUTCHours() * 60 + sent.getUTCMinutes();
      expect(minutes).toBeGreaterThanOrEqual(9 * 60);
      expect(minutes).toBeLessThan(17 * 60);
    }

    const before = planAt("2026-01-15T08:59:00.000Z");
    expect(before.sends).toHaveLength(0);
    expect(before.skips[0]?.reason).toBe("outside_window");
    expect(before.skips[0]?.log).toBe(
      "[send] skipped reason=outside_window mailbox=mbx_1 enrollment=enr_1 contact=ctc_1",
    );

    const atEnd = planAt("2026-01-15T17:00:00.000Z");
    expect(atEnd.sends).toHaveLength(0);
    expect(atEnd.skips[0]?.reason).toBe("outside_window");

    const sunday = planSendTick({
      now: new Date("2026-01-18T12:00:00.000Z"),
      mailboxes: [mailbox({ sendingDays: [1, 2, 3, 4, 5] })],
      candidates: [candidate({ dueAt: new Date("2026-01-18T12:00:00.000Z") })],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(sunday.sends).toHaveLength(0);
    expect(sunday.skips[0]?.reason).toBe("not_sending_day");
  });

  it("respects the random gap, including across local midnight", () => {
    const rolls = [0, 0.2, 0.999999];
    for (const roll of rolls) {
      const gap = pickGapMinutes(4, 9, () => roll);
      expect(gap).toBeGreaterThanOrEqual(4);
      expect(gap).toBeLessThanOrEqual(9);
    }

    const last = new Date("2026-01-15T12:00:00.000Z");
    const tooSoon = planSendTick({
      now: new Date(last.getTime() + 4 * minute - 1),
      mailboxes: [mailbox({ sentAtTimes: [last], nextGapMinutes: 4 })],
      candidates: [candidate({ dueAt: last })],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(tooSoon.sends).toHaveLength(0);
    expect(tooSoon.skips[0]?.reason).toBe("gap_not_elapsed");

    const ready = planSendTick({
      now: new Date(last.getTime() + 4 * minute),
      mailboxes: [mailbox({ sentAtTimes: [last], nextGapMinutes: 4 })],
      candidates: [candidate({ dueAt: last })],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(ready.sends).toHaveLength(1);

    const late = new Date("2026-01-15T23:55:00.000Z");
    const afterMidnight = planSendTick({
      now: new Date("2026-01-16T00:01:00.000Z"),
      mailboxes: [mailbox({ sentAtTimes: [late], nextGapMinutes: 9, windowStart: "00:00", windowEnd: "00:00" })],
      candidates: [candidate({ dueAt: late })],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(afterMidnight.sends).toHaveLength(0);
    expect(afterMidnight.skips[0]?.reason).toBe("gap_not_elapsed");
  });

  it("stops every enrollment on a real reply and still sends after an auto-reply", () => {
    const enrollments = [
      { id: "enr_1", status: "active" as const },
      { id: "enr_2", status: "active" as const },
      { id: "enr_done", status: "completed" as const },
    ];
    const reply = applyRecipientEvent({
      kind: "reply",
      contactStatus: "active",
      email: "jane@harbor-dental.test",
      enrollments,
    });
    expect(reply.sequenceStopped).toBe(true);
    expect(reply.contactStatus).toBe("replied");
    expect(reply.suppressEmail).toBeNull();
    expect(reply.enrollments.map((enrollment) => enrollment.status)).toEqual([
      "stopped",
      "stopped",
      "completed",
    ]);

    const blocked = planSendTick({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [candidate({ contactStatus: "replied" })],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(blocked.sends).toHaveLength(0);
    expect(blocked.skips[0]?.reason).toBe("contact_replied");

    expect(classifyInbound({ autoSubmitted: "auto-replied" })).toBe("auto_reply");
    expect(classifyInbound({ xAutoreply: "yes" })).toBe("auto_reply");
    expect(classifyInbound({ xAutorespond: "yes" })).toBe("auto_reply");
    expect(classifyInbound({ subject: "Out of Office: Jane" })).toBe("auto_reply");
    expect(classifyInbound({ subject: "Automatic reply" })).toBe("reply");
    expect(classifyInbound({ autoSubmitted: "no", subject: "Re: Quick question" })).toBe("reply");

    const auto = applyRecipientEvent({
      kind: classifyInbound({ subject: "Out of office" }),
      contactStatus: "active",
      email: "jane@harbor-dental.test",
      enrollments,
    });
    expect(auto.sequenceStopped).toBe(false);
    expect(auto.contactStatus).toBe("active");
    expect(auto.enrollments[0]?.status).toBe("active");

    const stillSending = planSendTick({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [candidate()],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(stillSending.sends).toHaveLength(1);
  });

  it("suppresses a bounced contact and never sends to a suppressed address", () => {
    const bounced = applyRecipientEvent({
      kind: "bounce",
      contactStatus: "active",
      email: "Jane@Harbor-Dental.test",
      enrollments: [{ id: "enr_1", status: "active" }],
    });
    expect(bounced.contactStatus).toBe("bounced");
    expect(bounced.sequenceStopped).toBe(true);
    expect(bounced.suppressEmail).toBe("jane@harbor-dental.test");
    expect(bounced.enrollments[0]?.status).toBe("stopped");

    const byStatus = planSendTick({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [candidate({ contactStatus: "bounced" })],
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(byStatus.sends).toHaveLength(0);
    expect(byStatus.skips[0]?.reason).toBe("contact_bounced");

    const byList = planSendTick({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [
        candidate(),
        candidate({
          enrollmentId: "enr_2",
          contactId: "ctc_2",
          contactEmail: "sam@mail.harbor-dental.test",
        }),
      ],
      suppressions: [{ kind: "domain", value: "Harbor-Dental.test" }],
      inFlightMailboxIds: [],
    });
    expect(byList.sends).toHaveLength(0);
    expect(byList.skips.map((skip) => skip.reason)).toEqual(["suppressed", "suppressed"]);
  });

  it("puts a mailto-free one-click unsubscribe on the message and the link works", () => {
    const built = buildOutgoingEmail({
      ...candidate(),
      toAddress: "jane@harbor-dental.test",
      messageId: "<step1@harbor-dental.test>",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.email.listUnsubscribe).toBe(
      "<https://app.example.test/u/tok_1>",
    );
    expect(built.email.listUnsubscribePost).toBe("List-Unsubscribe=One-Click");
    expect(built.email.listUnsubscribe.toLowerCase()).not.toContain("mailto:");
    expect(built.email.text).toContain("https://app.example.test/u/tok_1");

    const post = applyRecipientEvent({
      kind: "unsubscribe",
      contactStatus: "active",
      email: "Jane@Harbor-Dental.test",
      enrollments: [{ id: "enr_1", status: "active" }],
    });
    expect(post.contactStatus).toBe("unsubscribed");
    expect(post.suppressEmail).toBe("jane@harbor-dental.test");
    expect(post.sequenceStopped).toBe(true);
    expect(post.enrollments[0]?.status).toBe("stopped");

    const after = planSendTick({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [candidate({ contactStatus: "unsubscribed" })],
      suppressions: [{ kind: "email", value: post.suppressEmail ?? "" }],
      inFlightMailboxIds: [],
    });
    expect(after.sends).toHaveLength(0);
    expect(after.skips[0]?.reason).toBe("contact_unsubscribed");
  });
});

function planAt(iso: string) {
  const now = new Date(iso);
  return planSendTick({
    now,
    mailboxes: [mailbox()],
    candidates: [candidate({ dueAt: new Date("2026-01-15T00:00:00.000Z") })],
    suppressions: [],
    inFlightMailboxIds: [],
  });
}

function simulate(input: {
  cap: number;
  rampStartedOn: string;
  gap: number;
  from: string;
  until: string;
  windowStart: string;
  windowEnd: string;
  queue: number;
}): { sent: Date[]; blockedByCap: number } {
  let box: MailboxSnapshot = mailbox({
    dailyCap: input.cap,
    rampStartedOn: input.rampStartedOn,
    minGapMinutes: input.gap,
    maxGapMinutes: input.gap,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  });
  let queue: SendCandidate[] = Array.from({ length: input.queue }, (_, index) =>
    candidate({
      enrollmentId: `enr_${index}`,
      contactId: `ctc_${index}`,
      contactEmail: `person${index}@harbor-dental.test`,
      dueAt: new Date(input.from),
    }),
  );
  const sent: Date[] = [];
  let blockedByCap = 0;
  let capStreak = 0;
  for (let time = new Date(input.from).getTime(); time < new Date(input.until).getTime(); time += minute) {
    const now = new Date(time);
    const plan = planSendTick({
      now,
      mailboxes: [box],
      candidates: queue,
      suppressions: [],
      inFlightMailboxIds: [],
    });
    expect(plan.sends.length).toBeLessThanOrEqual(1);
    if (plan.skips.some((skip) => skip.reason === "daily_cap")) {
      blockedByCap += 1;
      capStreak += 1;
      if (capStreak >= 3) break;
    } else {
      capStreak = 0;
    }
    const next = plan.sends[0];
    if (!next) continue;
    sent.push(now);
    const gap = pickGapMinutes(box.minGapMinutes, box.maxGapMinutes, () => 0);
    box = {
      ...box,
      sentAtTimes: [...box.sentAtTimes, now],
      nextGapMinutes: gap,
    };
    queue = queue.filter((item) => item.enrollmentId !== next.enrollmentId);
  }
  return { sent, blockedByCap };
}
