import type { MailboxSnapshot, SendCandidate } from "./types.js";

/** Thursday 15 Jan 2026, 12:00 UTC. Inside a 09:00–17:00 UTC window. */
export const NOON = new Date("2026-01-15T12:00:00.000Z");

export function mailbox(overrides: Partial<MailboxSnapshot> = {}): MailboxSnapshot {
  return {
    id: "mbx_1",
    fromAddress: "ada@harbor-dental.test",
    fromName: "Ada",
    timezone: "UTC",
    sendingDays: [1, 2, 3, 4, 5, 6, 7],
    windowStart: "09:00",
    windowEnd: "17:00",
    dailyCap: 30,
    minGapMinutes: 4,
    maxGapMinutes: 9,
    rampStartedOn: "2025-01-01",
    paused: false,
    consecutiveAuthFailures: 0,
    sentAtTimes: [],
    nextGapMinutes: null,
    ...overrides,
  };
}

export function candidate(overrides: Partial<SendCandidate> = {}): SendCandidate {
  return {
    enrollmentId: "enr_1",
    enrollmentStatus: "active",
    campaignId: "cmp_1",
    campaignStatus: "running",
    contactId: "ctc_1",
    contactEmail: "jane@harbor-dental.test",
    contactStatus: "active",
    mailboxId: "mbx_1",
    mailboxChoices: ["mbx_1"],
    stepId: "stp_1",
    stepNumber: 1,
    dueAt: NOON,
    attempts: 0,
    retryAt: null,
    stepSubject: "Quick question",
    previousMessageId: null,
    previousReferences: null,
    previousSubject: null,
    fromAddress: "ada@harbor-dental.test",
    fromName: "Ada",
    toName: "Jane",
    bodyText: "Hello {{unsubscribe_link}}",
    bodyHtml: null,
    publicUrl: "https://app.example.test",
    unsubscribeToken: "tok_1",
    nextStep: null,
    ...overrides,
  };
}
