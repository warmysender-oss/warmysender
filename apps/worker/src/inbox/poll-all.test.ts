import { describe, expect, it } from "vitest";
import { pollAllMailboxes, type ImapSession } from "./poll-all.js";
import type { InboxPollStore, MailboxPollState } from "./poll.js";

function store(): InboxPollStore & { states: MailboxPollState[] } {
  const states: MailboxPollState[] = [];
  return {
    states,
    async isUidStored() {
      return false;
    },
    async commit() {
      return undefined;
    },
    async saveState(_mailboxId: string, state: MailboxPollState) {
      states.push(state);
    },
  };
}

describe("pollAllMailboxes", () => {
  it("baselines each open mailbox and does not connect a paused one", async () => {
    const opened: string[] = [];
    const memory = store();
    const results = await pollAllMailboxes({
      store: memory,
      async listMailboxes() {
        return [
          { id: "mb-open", paused: false, consecutiveAuthFailures: 0, lastSeenUid: null, sentMessages: [] },
          { id: "mb-paused", paused: true, consecutiveAuthFailures: 3, lastSeenUid: 4, sentMessages: [] },
        ];
      },
      async open(mailboxId: string): Promise<ImapSession> {
        opened.push(mailboxId);
        return {
          async listUids() {
            return [8];
          },
          async fetchRaw() {
            return "";
          },
          async close() {
            return undefined;
          },
        };
      },
    });
    expect(opened).toEqual(["mb-open"]);
    expect(results.map((result) => result.lastSeenUid)).toEqual([8, 4]);
    expect(results[1]?.logs[0]).toContain("reason=paused");
    expect(memory.states[0]?.lastSeenUid).toBe(8);
  });
});