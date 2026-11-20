import { effectsForDelivery, planSendTick } from "../../../packages/core/src/scheduler/index.js";
import type {
  CycleEffect,
  MailboxSnapshot,
  PlanResult,
  SendCandidate,
  SmtpTransport,
  SuppressionEntry,
} from "../../../packages/core/src/scheduler/index.js";
import { buildOutgoingEmail, createMessageId } from "../../../packages/core/src/mail/send.js";
import { formatSendLog } from "../../../packages/core/src/scheduler/log.js";

export type SendCycleInput = {
  now: Date;
  mailboxes: readonly MailboxSnapshot[];
  candidates: readonly SendCandidate[];
  suppressions: readonly SuppressionEntry[];
  inFlightMailboxIds: readonly string[];
  transport: SmtpTransport;
  rng?: () => number;
  newId?: () => string;
};

export type SendCycleResult = {
  plan: PlanResult;
  effects: CycleEffect[];
};

/**
 * One worker minute: plan at most one send per mailbox, then perform those sends.
 * Persistence is the caller's job — this returns effects and does not touch a database.
 * pg-boss registration is added when the Task 01 worker shell is on main.
 */
export async function runSendCycle(input: SendCycleInput): Promise<SendCycleResult> {
  const plan = planSendTick({
    now: input.now,
    mailboxes: input.mailboxes,
    candidates: input.candidates,
    suppressions: input.suppressions,
    inFlightMailboxIds: input.inFlightMailboxIds,
  });
  const effects: CycleEffect[] = plan.skips.map((skip) => ({ type: "log", line: skip.log }));
  const rng = input.rng ?? Math.random;
  const newId = input.newId ?? (() => crypto.randomUUID());
  const mailboxes = new Map(input.mailboxes.map((mailbox) => [mailbox.id, mailbox]));

  for (const decision of plan.sends) {
    const mailbox = mailboxes.get(decision.mailboxId);
    if (!mailbox) continue;
    const emailBuilt = buildOutgoingEmail({
      ...decision.candidate,
      toAddress: decision.candidate.contactEmail,
      messageId: createMessageId(decision.candidate.fromAddress, newId()),
    });
    if (!emailBuilt.ok) {
      effects.push({
        type: "log",
        line: formatSendLog("skipped", {
          reason: emailBuilt.reason,
          mailbox: decision.mailboxId,
          enrollment: decision.enrollmentId,
          contact: decision.contactId,
        }),
      });
      continue;
    }
    let result: Awaited<ReturnType<SmtpTransport["send"]>>;
    try {
      result = await input.transport.send(emailBuilt.email);
    } catch (error) {
      const message = error instanceof Error ? error.message : "send threw";
      result = { ok: false, failure: { message, timedOut: true } };
    }
    effects.push(
      ...effectsForDelivery({
        now: input.now,
        decision,
        mailbox,
        email: emailBuilt.email,
        rng,
        result,
      }),
    );
  }

  return { plan, effects };
}

export const SEND_TICK_CRON = "* * * * *";

export type SendJobBoss = {
  schedule: (
    name: string,
    cron: string,
    data?: unknown,
    options?: { tz?: string },
  ) => Promise<unknown>;
  work: (name: string, handler: () => Promise<unknown>) => Promise<unknown>;
};

export type SendRepository = {
  load: (now: Date) => Promise<Omit<SendCycleInput, "transport" | "rng" | "newId" | "now">>;
  commit: (effects: CycleEffect[]) => Promise<void>;
};

/** Load, send, commit. The Drizzle adapter is wired when the Task 01 schema is on main. */
export async function runSendJob(
  repo: SendRepository,
  transport: SmtpTransport,
  now = new Date(),
  rng?: () => number,
): Promise<SendCycleResult> {
  const loaded = await repo.load(now);
  const result = await runSendCycle({ ...loaded, now, transport, rng });
  await repo.commit(result.effects);
  return result;
}

export async function registerSendTick(boss: SendJobBoss, run: () => Promise<void>): Promise<void> {
  await boss.schedule("send-tick", SEND_TICK_CRON, {}, { tz: "UTC" });
  await boss.work("send-tick", async () => {
    await run();
  });
}
