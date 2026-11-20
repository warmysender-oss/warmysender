import { describe, expect, it } from "vitest";
import {
  AUTH_RETRY_DELAY_MS,
  NOON,
  PAUSE_REASON_AUTH,
  candidate,
  mailbox,
  type CycleEffect,
  type MailboxSnapshot,
  type SendCandidate,
  type SmtpTransport,
} from "@warmysender/core";
import { registerSendTick, runSendCycle, runSendJob, SEND_TICK_CRON } from "./send-cycle.js";

describe("send cycle", () => {
  it("records a sent message and schedules the next step", async () => {
    const sent: string[] = [];
    const transport: SmtpTransport = {
      send: async (email) => {
        sent.push(email.subject);
        return { ok: true, messageId: email.messageId };
      },
    };
    const result = await runSendCycle({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [candidate({ nextStep: { stepNumber: 2, delayDays: 3 } })],
      suppressions: [],
      inFlightMailboxIds: [],
      transport,
      rng: () => 0,
      newId: () => "abc",
    });
    expect(sent).toEqual(["Quick question"]);
    const message = result.effects.find((effect) => effect.type === "message");
    expect(message && message.type === "message" ? message.message.status : null).toBe("sent");
    expect(message && message.type === "message" ? message.message.inReplyTo : "x").toBeNull();
    const enrollment = result.effects.find((effect) => effect.type === "enrollment");
    expect(enrollment).toMatchObject({
      type: "enrollment",
      update: {
        status: "active",
        stepNumber: 2,
        nextSendAt: new Date("2026-01-18T12:00:00.000Z"),
        attempts: 0,
      },
    });
    const box = result.effects.find((effect) => effect.type === "mailbox");
    expect(box).toMatchObject({
      type: "mailbox",
      update: { nextGapMinutes: 4, consecutiveAuthFailures: 0 },
    });
  });

  it("threads a follow-up through the transport", async () => {
    let seen: { inReplyTo: string | null; references: string | null; subject: string } | null = null;
    const transport: SmtpTransport = {
      send: async (email) => {
        seen = {
          inReplyTo: email.inReplyTo,
          references: email.references,
          subject: email.subject,
        };
        return { ok: true };
      },
    };
    await runSendCycle({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [
        candidate({
          stepNumber: 2,
          stepSubject: null,
          previousMessageId: "<step-1@harbor-dental.test>",
          previousSubject: "Quick question",
        }),
      ],
      suppressions: [],
      inFlightMailboxIds: [],
      transport,
      rng: () => 0,
      newId: () => "follow",
    });
    expect(seen).toEqual({
      inReplyTo: "<step-1@harbor-dental.test>",
      references: "<step-1@harbor-dental.test>",
      subject: "Re: Quick question",
    });
  });

  it("retries a 4xx, fails the third try, and bounces a 5xx into suppression", async () => {
    const retry = await runSendCycle({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [candidate()],
      suppressions: [],
      inFlightMailboxIds: [],
      transport: { send: async () => ({ ok: false, failure: { responseCode: 450 } }) },
      rng: () => 0,
    });
    expect(retry.effects.find((effect) => effect.type === "log")).toMatchObject({
      type: "log",
      line: expect.stringContaining("[send] retry reason=transient"),
    });
    const waiting = applyEffects(
      { mailboxes: [mailbox()], candidates: [candidate()], suppressions: [] },
      retry.effects,
    );
    const tooSoon = await runSendCycle({
      now: new Date(NOON.getTime() + 60_000),
      ...waiting,
      inFlightMailboxIds: [],
      transport: { send: async () => ({ ok: true }) },
      rng: () => 0,
    });
    expect(tooSoon.plan.sends).toHaveLength(0);
    expect(tooSoon.plan.skips[0]?.reason).toBe("retry_waiting");

    const exhausted = await runSendCycle({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [candidate({ attempts: 2, retryAt: NOON })],
      suppressions: [],
      inFlightMailboxIds: [],
      transport: { send: async () => ({ ok: false, failure: { timedOut: true } }) },
    });
    const stopped = exhausted.effects.find((effect) => effect.type === "enrollment");
    expect(stopped).toMatchObject({ update: { status: "stopped" } });

    const bounced = await runSendCycle({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [candidate()],
      suppressions: [],
      inFlightMailboxIds: [],
      transport: {
        send: async () => ({ ok: false, failure: { responseCode: 550, enhancedCode: "5.1.1" } }),
      },
    });
    expect(bounced.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "contact", status: "bounced" }),
        expect.objectContaining({ type: "suppression", email: "jane@harbor-dental.test" }),
        expect.objectContaining({ type: "log", line: expect.stringContaining("[send] bounced reason=smtp_5xx") }),
      ]),
    );
    const afterBounce = applyEffects(
      { mailboxes: [mailbox()], candidates: [candidate()], suppressions: [] },
      bounced.effects,
    );
    const next = await runSendCycle({
      now: new Date(NOON.getTime() + 10 * 60_000),
      ...afterBounce,
      inFlightMailboxIds: [],
      transport: { send: async () => ({ ok: true }) },
    });
    expect(next.plan.sends).toHaveLength(0);
    expect(next.plan.skips[0]?.reason).toBe("contact_bounced");
  });

  it("pauses after three auth failures and does not send a minute later", async () => {
    let state = {
      mailboxes: [mailbox()],
      candidates: [candidate()],
      suppressions: [] as { kind: "email" | "domain"; value: string }[],
    };
    let pauseLine = "";
    let pauseReason = "";
    for (let i = 0; i < 3; i += 1) {
      const result = await runSendCycle({
        now: new Date(NOON.getTime() + i * AUTH_RETRY_DELAY_MS),
        ...state,
        inFlightMailboxIds: [],
        transport: { send: async () => ({ ok: false, failure: { responseCode: 535, authFailed: true } }) },
      });
      const mailboxEffect = result.effects.find((effect) => effect.type === "mailbox");
      if (mailboxEffect && mailboxEffect.type === "mailbox" && mailboxEffect.update.pausedReason) {
        pauseReason = mailboxEffect.update.pausedReason;
      }
      const log = result.effects.find((effect) => effect.type === "log");
      if (log && log.type === "log" && log.line.includes("paused")) pauseLine = log.line;
      state = applyEffects(state, result.effects);
    }
    expect(state.mailboxes[0]?.paused).toBe(true);
    expect(state.mailboxes[0]?.consecutiveAuthFailures).toBe(3);
    expect(pauseReason).toBe(PAUSE_REASON_AUTH);
    expect(pauseLine).toBe("[send] paused reason=auth_failures mailbox=mbx_1 count=3");
    const logged = await runSendCycle({
      now: new Date(NOON.getTime() + 3 * AUTH_RETRY_DELAY_MS),
      ...state,
      inFlightMailboxIds: [],
      transport: { send: async () => ({ ok: true }) },
    });
    expect(logged.plan.sends).toHaveLength(0);
    expect(logged.plan.skips[0]?.reason).toBe("mailbox_paused");
  });

  it("commits through the repository and registers a one-minute job", async () => {
    let committed: CycleEffect[] = [];
    await runSendJob(
      {
        load: async () => ({
          mailboxes: [mailbox()],
          candidates: [candidate()],
          suppressions: [],
          inFlightMailboxIds: [],
        }),
        commit: async (effects) => {
          committed = effects;
        },
      },
      { send: async () => ({ ok: true }) },
      NOON,
      () => 0,
    );
    expect(committed.some((effect) => effect.type === "message")).toBe(true);

    const calls: string[] = [];
    await registerSendTick(
      {
        schedule: async (name, cron) => {
          calls.push(`${name} ${cron}`);
        },
        work: async (name, handler) => {
          calls.push(`work ${name}`);
          await handler();
        },
      },
      async () => {
        calls.push("ran");
      },
    );
    expect(calls).toEqual([`send-tick ${SEND_TICK_CRON}`, "work send-tick", "ran"]);
  });
});

function applyEffects(
  state: {
    mailboxes: MailboxSnapshot[];
    candidates: SendCandidate[];
    suppressions: { kind: "email" | "domain"; value: string }[];
  },
  effects: CycleEffect[],
) {
  const mailboxes = state.mailboxes.map((box) => ({ ...box, sentAtTimes: [...box.sentAtTimes] }));
  const candidates = state.candidates.map((item) => ({ ...item }));
  const suppressions = [...state.suppressions];
  for (const effect of effects) {
    if (effect.type === "mailbox") {
      const box = mailboxes.find((item) => item.id === effect.mailboxId);
      if (!box) continue;
      if (effect.update.appendSentAt) box.sentAtTimes = [...box.sentAtTimes, effect.update.appendSentAt];
      if (effect.update.nextGapMinutes !== undefined) box.nextGapMinutes = effect.update.nextGapMinutes;
      if (effect.update.consecutiveAuthFailures !== undefined) {
        box.consecutiveAuthFailures = effect.update.consecutiveAuthFailures;
      }
      if (effect.update.paused !== undefined) box.paused = effect.update.paused;
    }
    if (effect.type === "enrollment") {
      const item = candidates.find((candidateRow) => candidateRow.enrollmentId === effect.enrollmentId);
      if (!item) continue;
      if (effect.update.status) item.enrollmentStatus = effect.update.status;
      if (effect.update.attempts !== undefined) item.attempts = effect.update.attempts;
      if (effect.update.retryAt !== undefined) item.retryAt = effect.update.retryAt;
      if (effect.update.stepNumber !== undefined) item.stepNumber = effect.update.stepNumber;
      if (effect.update.nextSendAt) item.dueAt = effect.update.nextSendAt;
    }
    if (effect.type === "contact") {
      for (const item of candidates) {
        if (item.contactId === effect.contactId) item.contactStatus = effect.status;
      }
    }
    if (effect.type === "suppression") suppressions.push({ kind: "email", value: effect.email });
  }
  return { mailboxes, candidates, suppressions };
}
