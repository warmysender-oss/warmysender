import { decideInbound, effectPlan } from "./decide.js";
import { parseRawEmail } from "./parse-raw.js";
import type { InboundDecision, InboundMail, InboxEffect, SentMessageRef } from "./types.js";

export class ImapAuthError extends Error {
  constructor(message = "IMAP authentication failed") {
    super(message);
    this.name = "ImapAuthError";
  }
}

export interface MailboxCursor {
  id: string;
  paused: boolean;
  consecutiveAuthFailures: number;
  lastSeenUid: number | null;
}

export interface CommitEvent {
  uid: number;
  mail: InboundMail;
  decision: InboundDecision;
  plan: InboxEffect[];
  lastSeenUid: number;
}

export interface MailboxPollState {
  lastSeenUid: number | null;
  consecutiveAuthFailures: number;
  paused: boolean;
  pauseReason: string | null;
}

export interface InboxPollStore {
  isUidStored(mailboxId: string, uid: number): Promise<boolean>;
  /** Persist the message and its effect plan. `lastSeenUid` advances in the same transaction. */
  commit(mailboxId: string, event: CommitEvent): Promise<void>;
  saveState(mailboxId: string, state: MailboxPollState): Promise<void>;
}

export interface PollMailboxInput {
  mailbox: MailboxCursor;
  sentMessages: readonly SentMessageRef[];
  listUids: () => Promise<number[]>;
  fetchRaw: (uid: number) => Promise<string>;
  store: InboxPollStore;
}

export interface PollResult {
  logs: string[];
  lastSeenUid: number | null;
  consecutiveAuthFailures: number;
  paused: boolean;
  processed: number;
}

const AUTH_FAILURES_BEFORE_PAUSE = 3;

function log(fields: Record<string, string | number | boolean>): string {
  return ["[inbox]", ...Object.entries(fields).map(([key, value]) => `${key}=${value}`)].join(" ");
}

function uidsAfter(lastSeenUid: number, remote: readonly number[]): number[] {
  return remote.filter((uid) => Number.isInteger(uid) && uid > lastSeenUid).sort((a, b) => a - b);
}

function maxUid(uids: readonly number[]): number {
  return uids.reduce((max, uid) => (uid > max ? uid : max), 0);
}

/**
 * Poll one mailbox. The first successful listing sets a UID baseline and does not import
 * mail that was already in the inbox. Later polls fetch only UIDs above that baseline.
 * Three IMAP authentication failures in a row pause the mailbox.
 */
export async function pollMailbox(input: PollMailboxInput): Promise<PollResult> {
  const { mailbox, store } = input;
  const logs: string[] = [];
  if (mailbox.paused) {
    logs.push(log({ event: "skipped", reason: "paused", mailbox: mailbox.id }));
    return {
      logs,
      lastSeenUid: mailbox.lastSeenUid,
      consecutiveAuthFailures: mailbox.consecutiveAuthFailures,
      paused: true,
      processed: 0,
    };
  }

  let remote: number[];
  try {
    remote = await input.listUids();
  } catch (error) {
    if (error instanceof ImapAuthError) return failAuth(mailbox, store, logs, mailbox.lastSeenUid, 0);
    throw error;
  }

  if (mailbox.lastSeenUid === null) {
    const baseline = maxUid(remote);
    await store.saveState(mailbox.id, {
      lastSeenUid: baseline,
      consecutiveAuthFailures: 0,
      paused: false,
      pauseReason: null,
    });
    logs.push(log({ event: "baseline", mailbox: mailbox.id, uid: baseline, reason: "first_poll" }));
    return { logs, lastSeenUid: baseline, consecutiveAuthFailures: 0, paused: false, processed: 0 };
  }

  const pending = uidsAfter(mailbox.lastSeenUid, remote);
  let lastSeen = mailbox.lastSeenUid;
  let processed = 0;
  for (const uid of pending) {
    if (await store.isUidStored(mailbox.id, uid)) {
      lastSeen = uid;
      continue;
    }
    let raw: string;
    try {
      raw = await input.fetchRaw(uid);
    } catch (error) {
      if (error instanceof ImapAuthError) {
        if (lastSeen !== mailbox.lastSeenUid) {
          await store.saveState(mailbox.id, {
            lastSeenUid: lastSeen,
            consecutiveAuthFailures: 0,
            paused: false,
            pauseReason: null,
          });
        }
        const auth = await failAuth({ ...mailbox, lastSeenUid: lastSeen, consecutiveAuthFailures: 0 }, store, logs, lastSeen, processed);
        return auth;
      }
      logs.push(log({ event: "fetch_failed", mailbox: mailbox.id, uid }));
      break;
    }
    const mail = parseRawEmail(raw);
    const decision = decideInbound(mail, input.sentMessages);
    const plan = effectPlan(decision);
    lastSeen = uid;
    await store.commit(mailbox.id, { uid, mail, decision, plan, lastSeenUid: lastSeen });
    processed += 1;
    logs.push(
      log({
        event: "classified",
        mailbox: mailbox.id,
        uid,
        kind: decision.kind,
        stop: decision.contactEffects.some((effect) => effect.stopEnrollments),
      }),
    );
  }

  await store.saveState(mailbox.id, {
    lastSeenUid: lastSeen,
    consecutiveAuthFailures: 0,
    paused: false,
    pauseReason: null,
  });
  return { logs, lastSeenUid: lastSeen, consecutiveAuthFailures: 0, paused: false, processed };
}

async function failAuth(
  mailbox: MailboxCursor,
  store: InboxPollStore,
  logs: string[],
  lastSeenUid: number | null,
  processed: number,
): Promise<PollResult> {
  const consecutiveAuthFailures = mailbox.consecutiveAuthFailures + 1;
  const paused = consecutiveAuthFailures >= AUTH_FAILURES_BEFORE_PAUSE;
  logs.push(
    log({
      event: paused ? "paused" : "auth_failed",
      mailbox: mailbox.id,
      failures: consecutiveAuthFailures,
      reason: "imap_auth",
    }),
  );
  await store.saveState(mailbox.id, {
    lastSeenUid,
    consecutiveAuthFailures,
    paused,
    pauseReason: paused ? "IMAP login failed 3 times. Reconnect this mailbox." : null,
  });
  return { logs, lastSeenUid, consecutiveAuthFailures, paused, processed };
}
