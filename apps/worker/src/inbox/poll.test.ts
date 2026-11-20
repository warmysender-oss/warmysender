import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ImapAuthError, pollMailbox, type CommitEvent, type InboxPollStore, type MailboxPollState } from "./poll.js";
import type { SentMessageRef } from "./types.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const replyRaw = readFileSync(join(fixtures, "reply-in-reply-to.eml"), "utf8");
const autoRaw = readFileSync(join(fixtures, "auto-reply-ooo.eml"), "utf8");

const sent: SentMessageRef[] = [
  {
    messageId: "<campaign-step1@harbor-dental.test>",
    contactId: "contact-jane",
    contactEmail: "jane@river-clinic.test",
    enrollmentId: "enr-jane",
    campaignId: "camp-1",
    stepId: "step-1",
    mailboxId: "mb-1",
    subject: "Intro",
    sentAt: "2026-11-20T11:00:00.000Z",
  },
];

function memoryStore(stored: number[] = []): InboxPollStore & { commits: CommitEvent[]; states: MailboxPollState[] } {
  const known = new Set(stored);
  const commits: CommitEvent[] = [];
  const states: MailboxPollState[] = [];
  return {
    commits,
    states,
    async isUidStored(_mailboxId: string, uid: number) {
      return known.has(uid);
    },
    async commit(_mailboxId: string, event: CommitEvent) {
      known.add(event.uid);
      commits.push(event);
    },
    async saveState(_mailboxId: string, state: MailboxPollState) {
      states.push(state);
    },
  };
}

describe("pollMailbox", () => {
  it("baselines on the first poll and does not import existing mail", async () => {
    const store = memoryStore();
    const fetched: number[] = [];
    const result = await pollMailbox({
      mailbox: { id: "mb-1", paused: false, consecutiveAuthFailures: 2, lastSeenUid: null },
      sentMessages: sent,
      listUids: async () => [4, 9, 1],
      fetchRaw: async (uid) => {
        fetched.push(uid);
        return replyRaw;
      },
      store,
    });
    expect(fetched).toEqual([]);
    expect(result.processed).toBe(0);
    expect(result.lastSeenUid).toBe(9);
    expect(result.consecutiveAuthFailures).toBe(0);
    expect(result.logs[0]).toContain("event=baseline");
    expect(store.commits).toEqual([]);
  });

  it("fetches only UIDs above the baseline", async () => {
    const store = memoryStore([11]);
    const fetched: number[] = [];
    const result = await pollMailbox({
      mailbox: { id: "mb-1", paused: false, consecutiveAuthFailures: 0, lastSeenUid: 10 },
      sentMessages: sent,
      listUids: async () => [9, 11, 12],
      fetchRaw: async (uid) => {
        fetched.push(uid);
        return uid === 12 ? autoRaw : replyRaw;
      },
      store,
    });
    expect(fetched).toEqual([12]);
    expect(result.processed).toBe(1);
    expect(result.lastSeenUid).toBe(12);
    expect(store.commits[0]?.decision.kind).toBe("auto_reply");
    expect(store.commits[0]?.plan).toEqual([{ op: "store_inbound", kind: "auto_reply" }]);
    expect(result.logs.some((line) => line.includes("kind=auto_reply") && line.includes("stop=false"))).toBe(true);
  });

  it("stores a real reply with a stop effect", async () => {
    const store = memoryStore();
    await pollMailbox({
      mailbox: { id: "mb-1", paused: false, consecutiveAuthFailures: 0, lastSeenUid: 3 },
      sentMessages: sent,
      listUids: async () => [4],
      fetchRaw: async () => replyRaw,
      store,
    });
    expect(store.commits[0]?.plan).toEqual([
      { op: "store_inbound", kind: "reply" },
      { op: "set_contact_status", contactId: "contact-jane", status: "replied" },
      { op: "stop_enrollments", contactId: "contact-jane", reason: "reply" },
    ]);
  });

  it("does not advance past a UID that failed to download", async () => {
    const store = memoryStore();
    const fetched: number[] = [];
    const result = await pollMailbox({
      mailbox: { id: "mb-1", paused: false, consecutiveAuthFailures: 0, lastSeenUid: 10 },
      sentMessages: sent,
      listUids: async () => [11, 12],
      fetchRaw: async (uid) => {
        fetched.push(uid);
        throw new Error("timeout");
      },
      store,
    });
    expect(fetched).toEqual([11]);
    expect(result.lastSeenUid).toBe(10);
    expect(result.processed).toBe(0);
    expect(store.commits).toEqual([]);
    expect(result.logs.some((line) => line.includes("event=fetch_failed") && line.includes("uid=11"))).toBe(true);
  });

  it("pauses on the third authentication failure and leaves the cursor unset", async () => {
    const store = memoryStore();
    const result = await pollMailbox({
      mailbox: { id: "mb-1", paused: false, consecutiveAuthFailures: 2, lastSeenUid: null },
      sentMessages: sent,
      listUids: async () => {
        throw new ImapAuthError("no");
      },
      fetchRaw: async () => replyRaw,
      store,
    });
    expect(result.paused).toBe(true);
    expect(result.consecutiveAuthFailures).toBe(3);
    expect(result.lastSeenUid).toBeNull();
    expect(store.states.at(-1)).toMatchObject({
      paused: true,
      consecutiveAuthFailures: 3,
      lastSeenUid: null,
      pauseReason: "IMAP login failed 3 times. Reconnect this mailbox.",
    });
    expect(result.logs[0]).toContain("event=paused");
  });

  it("resets the authentication streak after a successful poll", async () => {
    const store = memoryStore();
    const result = await pollMailbox({
      mailbox: { id: "mb-1", paused: false, consecutiveAuthFailures: 2, lastSeenUid: 5 },
      sentMessages: sent,
      listUids: async () => [5],
      fetchRaw: async () => replyRaw,
      store,
    });
    expect(result.consecutiveAuthFailures).toBe(0);
    expect(result.paused).toBe(false);
    expect(store.states.at(-1)?.consecutiveAuthFailures).toBe(0);
  });

  it("skips a paused mailbox", async () => {
    let listed = false;
    const result = await pollMailbox({
      mailbox: { id: "mb-1", paused: true, consecutiveAuthFailures: 3, lastSeenUid: 8 },
      sentMessages: sent,
      listUids: async () => {
        listed = true;
        return [9];
      },
      fetchRaw: async () => replyRaw,
      store: memoryStore(),
    });
    expect(listed).toBe(false);
    expect(result.logs[0]).toContain("reason=paused");
  });

  it("baselines an empty inbox at UID 0", async () => {
    const result = await pollMailbox({
      mailbox: { id: "mb-1", paused: false, consecutiveAuthFailures: 0, lastSeenUid: null },
      sentMessages: sent,
      listUids: async () => [],
      fetchRaw: async () => replyRaw,
      store: memoryStore(),
    });
    expect(result.lastSeenUid).toBe(0);
    expect(result.processed).toBe(0);
  });
});
