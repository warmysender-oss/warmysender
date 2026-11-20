import { pollMailbox, type InboxPollStore, type MailboxCursor, type PollResult } from "./poll.js";
import type { SentMessageRef } from "./types.js";

export interface MailboxPollSource extends MailboxCursor {
  sentMessages: readonly SentMessageRef[];
}

export interface ImapSession {
  listUids(): Promise<number[]>;
  fetchRaw(uid: number): Promise<string>;
  close(): Promise<void>;
}

export interface InboxPollRunner {
  listMailboxes(): Promise<MailboxPollSource[]>;
  open(mailboxId: string): Promise<ImapSession>;
  store: InboxPollStore;
}

/** One pass of the 5-minute inbox job. A failure on one mailbox does not stop the others. */
export async function pollAllMailboxes(runner: InboxPollRunner): Promise<PollResult[]> {
  const mailboxes = await runner.listMailboxes();
  const results: PollResult[] = [];
  for (const mailbox of mailboxes) {
    if (mailbox.paused) {
      results.push(
        await pollMailbox({
          mailbox,
          sentMessages: mailbox.sentMessages,
          listUids: async () => [],
          fetchRaw: async () => "",
          store: runner.store,
        }),
      );
      continue;
    }
    const session = await runner.open(mailbox.id);
    try {
      results.push(
        await pollMailbox({
          mailbox,
          sentMessages: mailbox.sentMessages,
          listUids: () => session.listUids(),
          fetchRaw: (uid) => session.fetchRaw(uid),
          store: runner.store,
        }),
      );
    } finally {
      await session.close();
    }
  }
  return results;
}
