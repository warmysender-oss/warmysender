import {
  buildOutgoingEmail,
  createMessageId,
  effectsForDelivery,
  effectsForTemplateMiss,
  formatSendLog,
  planSendTick,
  type CycleEffect,
  type MailboxSnapshot,
  type OutgoingEmail,
  type PlanResult,
  type SendCandidate,
  type SendDecision,
  type SmtpTransport,
  type SuppressionEntry,
} from "@warmysender/core";

export type SendCycleInput = {
  now: Date;
  mailboxes: readonly MailboxSnapshot[];
  candidates: readonly SendCandidate[];
  suppressions: readonly SuppressionEntry[];
  inFlightMailboxIds: readonly string[];
  transport: SmtpTransport;
  rng?: () => number;
  newId?: () => string;
  /** Runs after the message is built and before SMTP. The repository stores the pending row here. */
  beforeSend?: (input: { decision: SendDecision; email: OutgoingEmail }) => Promise<void>;
  /** Test hook: the pending row is stored, then the process stops before SMTP. */
  stopAfterPersist?: boolean;
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
    const fromAddress = mailbox.fromAddress || decision.candidate.fromAddress;
    const emailBuilt = buildOutgoingEmail({
      ...decision.candidate,
      fromAddress,
      fromName: mailbox.fromName ?? decision.candidate.fromName,
      toAddress: decision.candidate.contactEmail,
      messageId: createMessageId(fromAddress, newId()),
      signature: mailbox.signature,
      firstName: decision.candidate.firstName,
      lastName: decision.candidate.lastName,
      company: decision.candidate.company,
      title: decision.candidate.title,
      customFields: decision.candidate.customFields,
    });
    if (!emailBuilt.ok) {
      if (emailBuilt.reason === "missing_variable") {
        effects.push(...effectsForTemplateMiss({ decision, fields: emailBuilt.fields ?? [] }));
      } else {
        effects.push({
          type: "log",
          line: formatSendLog("skipped", {
            reason: emailBuilt.reason,
            mailbox: decision.mailboxId,
            enrollment: decision.enrollmentId,
            contact: decision.contactId,
          }),
        });
      }
      continue;
    }
    try {
      await input.beforeSend?.({ decision, email: emailBuilt.email });
    } catch (error) {
      const message = error instanceof Error ? error.message : "send prepare failed";
      effects.push({
        type: "log",
        line: formatSendLog("failed", {
          reason: message,
          mailbox: decision.mailboxId,
          enrollment: decision.enrollmentId,
        }),
      });
      continue;
    }
    if (input.stopAfterPersist) continue;
    let result: Awaited<ReturnType<SmtpTransport["send"]>>;
    try {
      result = await input.transport.send(emailBuilt.email, decision.mailboxId);
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

/** Load, send, commit. Callers pass the Drizzle repository from `send-repository.ts`. */
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
