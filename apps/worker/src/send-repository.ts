import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { claimMailboxes, releaseMailboxClaims } from "./send-lock.js";
import { runSendCycle } from "./send-cycle.js";
import {
  auditLog,
  campaignMailboxes,
  campaignSteps,
  campaigns,
  contacts,
  enrollments,
  generateToken,
  mailboxes,
  messages,
  suppressions,
  unsubscribeTokens,
  MAX_SEND_ATTEMPTS,
  formatSendLog,
  inFlightDisposition,
  type AppDatabase,
  type CycleEffect,
  type MailboxSnapshot,
  type SendCandidate,
  type SmtpTransport,
  type SuppressionEntry,
} from "@warmysender/core";

export type PreparedSend = {
  mailboxes: MailboxSnapshot[];
  candidates: SendCandidate[];
  suppressions: SuppressionEntry[];
  inFlightMailboxIds: string[];
  tokens: UnsubscribeTokenInsert[];
  uncertain: UncertainSend[];
};

export type UncertainSend = {
  messageId: string;
  enrollmentId: string;
  mailboxId: string;
};

export type UnsubscribeTokenInsert = {
  plaintext: string;
  hash: string;
  contactId: string;
  campaignId: string;
  enrollmentId: string;
};

export async function loadDueCandidates(db: AppDatabase, now: Date, publicUrl: string): Promise<PreparedSend> {
  const suppressionRows = await db.select().from(suppressions);
  const mailboxRows = await db.select().from(mailboxes);
  const due = await db
    .select({
      enrollmentId: enrollments.id,
      enrollmentStatus: enrollments.status,
      campaignId: enrollments.campaignId,
      campaignStatus: campaigns.status,
      contactId: enrollments.contactId,
      contactEmail: contacts.email,
      contactStatus: contacts.status,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      company: contacts.company,
      title: contacts.title,
      customFields: contacts.customFields,
      mailboxId: enrollments.mailboxId,
      currentStep: enrollments.currentStep,
      nextSendAt: enrollments.nextSendAt,
      stepId: campaignSteps.id,
      stepSubject: campaignSteps.subject,
      stepBody: campaignSteps.body,
      stepIsHtml: campaignSteps.isHtml,
    })
    .from(enrollments)
    .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
    .innerJoin(contacts, eq(contacts.id, enrollments.contactId))
    .innerJoin(
      campaignSteps,
      and(
        eq(campaignSteps.campaignId, enrollments.campaignId),
        eq(campaignSteps.position, enrollments.currentStep),
      ),
    )
    .where(
      and(
        eq(enrollments.status, "active"),
        or(isNull(enrollments.nextSendAt), lte(enrollments.nextSendAt, now)),
      ),
    );

  const campaignIds = [...new Set(due.map((row) => row.campaignId))];
  const enrollmentIds = due.map((row) => row.enrollmentId);
  const links = campaignIds.length
    ? await db.select().from(campaignMailboxes).where(inArray(campaignMailboxes.campaignId, campaignIds))
    : [];
  const steps = campaignIds.length
    ? await db
        .select()
        .from(campaignSteps)
        .where(inArray(campaignSteps.campaignId, campaignIds))
        .orderBy(asc(campaignSteps.position))
    : [];
  const priorMessages = enrollmentIds.length
    ? await db.select().from(messages).where(inArray(messages.enrollmentId, enrollmentIds))
    : [];
  const sentRows = await db
    .select({ mailboxId: messages.mailboxId, sentAt: messages.sentAt })
    .from(messages)
    .where(eq(messages.status, "sent"));

  const sentByMailbox = new Map<string, Date[]>();
  for (const row of sentRows) {
    if (!row.sentAt) continue;
    const list = sentByMailbox.get(row.mailboxId) ?? [];
    list.push(row.sentAt);
    sentByMailbox.set(row.mailboxId, list);
  }

  const choicesByCampaign = new Map<string, string[]>();
  for (const link of links) {
    const list = choicesByCampaign.get(link.campaignId) ?? [];
    list.push(link.mailboxId);
    choicesByCampaign.set(link.campaignId, list);
  }

  const mailboxById = new Map(mailboxRows.map((row) => [row.id, row]));
  const tokens: UnsubscribeTokenInsert[] = [];
  const uncertain: UncertainSend[] = [];
  const candidates: SendCandidate[] = [];
  for (const row of due) {
    const history = priorMessages.filter((message) => message.enrollmentId === row.enrollmentId);
    const sentForThread = [...history].reverse().find((message) => message.status === "sent" && message.messageId);
    const current = [...history].reverse().find((message) => message.stepId === row.stepId);
    const disposition = current
      ? inFlightDisposition({
          status: current.status,
          sendStartedAt: current.sendStartedAt,
          nextAttemptAt: current.nextAttemptAt,
          now,
        })
      : "none";
    if (disposition === "in_flight") continue;
    if (disposition === "uncertain" && current) {
      uncertain.push({ messageId: current.id, enrollmentId: row.enrollmentId, mailboxId: current.mailboxId });
      continue;
    }
    const token = generateToken("unsub");
    tokens.push({
      plaintext: token.plaintext,
      hash: token.hash,
      contactId: row.contactId,
      campaignId: row.campaignId,
      enrollmentId: row.enrollmentId,
    });
    const next = steps.find((step) => step.campaignId === row.campaignId && step.position === row.currentStep + 1);
    const assigned = row.mailboxId ? mailboxById.get(row.mailboxId) : undefined;
    let attempts = 0;
    let retryAt: Date | null = null;
    if (current?.status === "failed" || current?.status === "sent") attempts = MAX_SEND_ATTEMPTS;
    else if (current?.status === "pending") {
      attempts = current.attemptCount;
      retryAt = current.nextAttemptAt;
    }
    candidates.push({
      enrollmentId: row.enrollmentId,
      enrollmentStatus: row.enrollmentStatus as SendCandidate["enrollmentStatus"],
      campaignId: row.campaignId,
      campaignStatus: row.campaignStatus as SendCandidate["campaignStatus"],
      contactId: row.contactId,
      contactEmail: row.contactEmail,
      contactStatus: row.contactStatus as SendCandidate["contactStatus"],
      firstName: row.firstName,
      lastName: row.lastName,
      company: row.company,
      title: row.title,
      customFields: stringFields(row.customFields),
      mailboxId: row.mailboxId,
      mailboxChoices: choicesByCampaign.get(row.campaignId) ?? [],
      stepId: row.stepId,
      stepNumber: row.currentStep,
      dueAt: row.nextSendAt ?? now,
      attempts,
      retryAt,
      stepSubject: row.stepSubject,
      previousMessageId: sentForThread?.messageId ?? null,
      previousReferences: sentForThread?.referencesHeader ?? null,
      previousSubject: sentForThread?.subject ?? null,
      fromAddress: assigned?.email ?? "",
      fromName: assigned?.fromName || null,
      toName: null,
      bodyText: row.stepIsHtml ? stripTags(row.stepBody) : row.stepBody,
      bodyHtml: row.stepIsHtml ? row.stepBody : null,
      publicUrl,
      unsubscribeToken: token.plaintext,
      nextStep: next ? { stepNumber: next.position, delayDays: next.delayDays } : null,
    });
  }

  return {
    mailboxes: mailboxRows.map((row) => ({
      id: row.id,
      fromAddress: row.email,
      fromName: row.fromName || null,
      timezone: row.timezone,
      sendingDays: row.sendingDays,
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      dailyCap: row.dailyCap,
      minGapMinutes: row.gapMinMinutes,
      maxGapMinutes: row.gapMaxMinutes,
      rampStartedOn: row.rampStartedOn,
      paused: row.health === "paused",
      consecutiveAuthFailures: row.consecutiveAuthFailures,
      consecutivePolicyFailures: row.consecutivePolicyFailures,
      signature: row.signature,
      sentAtTimes: sentByMailbox.get(row.id) ?? [],
      nextGapMinutes: row.nextGapMinutes,
    })),
    candidates,
    suppressions: suppressionRows.map((row) => ({
      kind: row.kind as SuppressionEntry["kind"],
      value: row.value,
    })),
    inFlightMailboxIds: [],
    tokens,
    uncertain,
  };
}

export async function storeUnsubscribeTokens(
  db: AppDatabase,
  tokens: readonly UnsubscribeTokenInsert[],
): Promise<void> {
  if (tokens.length === 0) return;
  await db.insert(unsubscribeTokens).values(
    tokens.map((token) => ({
      tokenHash: token.hash,
      contactId: token.contactId,
      campaignId: token.campaignId,
      enrollmentId: token.enrollmentId,
    })),
  );
}

export async function applyCycleEffects(
  db: AppDatabase,
  effects: readonly CycleEffect[],
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const effect of effects) {
      if (effect.type === "log") {
        await tx.insert(auditLog).values({
          category: "job",
          actorType: "worker",
          action: "send",
          detail: { line: effect.line },
        });
      } else if (effect.type === "message") {
        const message = effect.message;
        const existing = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(
            and(
              eq(messages.enrollmentId, message.enrollmentId),
              eq(messages.stepId, message.stepId),
              sql`${messages.status} <> 'sent'`,
            ),
          )
          .limit(1);
        const values = {
          enrollmentId: message.enrollmentId,
          campaignId: message.campaignId,
          stepId: message.stepId,
          mailboxId: message.mailboxId,
          contactId: message.contactId,
          messageId: message.messageId ? message.messageId : null,
          sendStartedAt: null,
          inReplyTo: message.inReplyTo,
          referencesHeader: message.references,
          subject: message.subject,
          bodyText: message.bodyText,
          bodyHtml: message.bodyHtml,
          status: message.status,
          error: message.error,
          attemptCount: message.attempt,
          nextAttemptAt: message.retryAt,
          sentAt: message.sentAt,
        };
        const row = existing[0];
        if (row) await tx.update(messages).set(values).where(eq(messages.id, row.id));
        else await tx.insert(messages).values(values);
      } else if (effect.type === "enrollment") {
        await tx
          .update(enrollments)
          .set(omitUndefined({
            status: effect.update.status,
            stopReason: effect.update.stopReason,
            currentStep: effect.update.stepNumber,
            nextSendAt: effect.update.nextSendAt,
            mailboxId: effect.update.mailboxId,
            updatedAt: now,
          }))
          .where(eq(enrollments.id, effect.enrollmentId));
      } else if (effect.type === "contact") {
        await tx
          .update(contacts)
          .set({ status: effect.status, updatedAt: now })
          .where(eq(contacts.id, effect.contactId));
      } else if (effect.type === "suppression") {
        await tx
          .insert(suppressions)
          .values({ kind: "email", value: effect.email, reason: "bounce" })
          .onConflictDoNothing({ target: [suppressions.kind, suppressions.value] });
      } else if (effect.type === "mailbox") {
        await tx
          .update(mailboxes)
          .set(omitUndefined({
            lastSendAt: effect.update.appendSentAt,
            nextGapMinutes: effect.update.nextGapMinutes,
            consecutiveAuthFailures: effect.update.consecutiveAuthFailures,
            consecutivePolicyFailures: effect.update.consecutivePolicyFailures,
            health: effect.update.paused === true ? "paused" : undefined,
            pausedReason: effect.update.pausedReason,
            updatedAt: now,
          }))
          .where(eq(mailboxes.id, effect.mailboxId));
      }
    }
  });
}

function omitUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined);
  return Object.fromEntries(entries) as Partial<T>;
}

export async function executeSendTick(input: {
  db: AppDatabase;
  now: Date;
  publicUrl: string;
  transport: SmtpTransport;
  rng?: () => number;
  stopAfterPersist?: boolean;
}): Promise<void> {
  const loaded = await loadDueCandidates(input.db, input.now, input.publicUrl);
  const mailboxIds = new Set<string>();
  for (const candidate of loaded.candidates) {
    if (candidate.mailboxId) mailboxIds.add(candidate.mailboxId);
    for (const choice of candidate.mailboxChoices) mailboxIds.add(choice);
  }
  for (const row of loaded.uncertain) mailboxIds.add(row.mailboxId);
  const claim = await claimMailboxes(input.db, [...mailboxIds], input.now);
  const claimed = new Set(claim.ids);
  try {
    await settleUncertain(
      input.db,
      loaded.uncertain.filter((row) => claimed.has(row.mailboxId)),
      input.now,
    );
    const candidates = loaded.candidates.flatMap((candidate) => {
      if (candidate.mailboxId) return claimed.has(candidate.mailboxId) ? [candidate] : [];
      const choices = candidate.mailboxChoices.filter((id) => claimed.has(id));
      return choices.length > 0 ? [{ ...candidate, mailboxChoices: choices }] : [];
    });
    const tokens = loaded.tokens.filter((token) =>
      candidates.some((candidate) => candidate.enrollmentId === token.enrollmentId),
    );
    await storeUnsubscribeTokens(input.db, tokens);
    const result = await runSendCycle({
      now: input.now,
      mailboxes: loaded.mailboxes.filter((mailbox) => claimed.has(mailbox.id)),
      candidates,
      suppressions: loaded.suppressions,
      inFlightMailboxIds: [],
      transport: input.transport,
      rng: input.rng,
      stopAfterPersist: input.stopAfterPersist,
      beforeSend: async ({ decision, email }) => {
        await persistInFlightSend(input.db, decision, email, input.now);
      },
    });
    if (!input.stopAfterPersist) await applyCycleEffects(input.db, result.effects, input.now);
  } finally {
    await releaseMailboxClaims(input.db, claim.ids, claim.until);
  }
}

async function persistInFlightSend(
  db: AppDatabase,
  decision: { mailboxId: string; enrollmentId: string; contactId: string; campaignId: string; stepId: string; candidate: { attempts: number } },
  email: { messageId: string; subject: string; text: string; html: string | null; inReplyTo: string | null; references: string | null },
  now: Date,
): Promise<void> {
  const values = {
    enrollmentId: decision.enrollmentId,
    campaignId: decision.campaignId,
    stepId: decision.stepId,
    mailboxId: decision.mailboxId,
    contactId: decision.contactId,
    messageId: email.messageId,
    inReplyTo: email.inReplyTo,
    referencesHeader: email.references,
    subject: email.subject,
    bodyText: email.text,
    bodyHtml: email.html,
    status: "pending" as const,
    error: null,
    attemptCount: decision.candidate.attempts + 1,
    nextAttemptAt: null,
    sendStartedAt: now,
    sentAt: null,
  };
  const existing = await db
    .select({ id: messages.id, status: messages.status })
    .from(messages)
    .where(and(eq(messages.enrollmentId, decision.enrollmentId), eq(messages.stepId, decision.stepId)))
    .limit(1);
  const row = existing[0];
  if (row?.status === "sent") throw new Error("step already sent");
  if (row) await db.update(messages).set(values).where(eq(messages.id, row.id));
  else await db.insert(messages).values(values);
}

async function settleUncertain(db: AppDatabase, rows: readonly UncertainSend[], now: Date): Promise<void> {
  for (const row of rows) {
    const updated = await db
      .update(messages)
      .set({ status: "failed", error: "outcome_unknown", sendStartedAt: null, nextAttemptAt: null })
      .where(and(eq(messages.id, row.messageId), eq(messages.status, "pending")))
      .returning({ id: messages.id });
    if (updated.length === 0) continue;
    await db
      .update(enrollments)
      .set({ status: "stopped", stopReason: "outcome_unknown", updatedAt: now })
      .where(and(eq(enrollments.id, row.enrollmentId), eq(enrollments.status, "active")));
    await db.insert(auditLog).values({
      category: "job",
      actorType: "worker",
      action: "send",
      detail: {
        line: formatSendLog("failed", {
          reason: "outcome_unknown",
          mailbox: row.mailboxId,
          enrollment: row.enrollmentId,
        }),
      },
    });
  }
}

function stringFields(value: unknown): Record<string, string | null | undefined> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string | null | undefined> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || item === null) out[key] = item;
    else if (typeof item === "number" || typeof item === "boolean") out[key] = String(item);
  }
  return out;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
