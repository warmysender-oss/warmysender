import { auditLog, decryptString, mailboxes, type AppDatabase } from "@warmysender/core";
import { openImap, type ImapConnection } from "./imap.js";
import { ImapAuthError, pollMailbox } from "./poll.js";
import { createInboxPollStore, loadSentMessages } from "./store.js";

interface MailboxRow {
  id: string;
  email: string;
  health: string;
  consecutiveAuthFailures: number;
  lastSeenImapUid: number | null;
  imapUidValidity: number | null;
  imapHost: string;
  imapPort: number;
  imapSecurity: string;
  imapUsername: string;
  imapPasswordEncrypted: string | null;
  oauthAccessTokenEncrypted: string | null;
  oauthAccessTokenExpiresAt: Date | null;
}

function connectionFor(row: MailboxRow, encryptionKey: Buffer): ImapConnection | null {
  const password = row.imapPasswordEncrypted ? decryptString(row.imapPasswordEncrypted, encryptionKey) : null;
  const tokenExpired = row.oauthAccessTokenExpiresAt !== null && row.oauthAccessTokenExpiresAt.getTime() <= Date.now();
  const accessToken =
    row.oauthAccessTokenEncrypted && !tokenExpired ? decryptString(row.oauthAccessTokenEncrypted, encryptionKey) : null;
  if (!row.imapHost) return null;
  if (!password && !accessToken) return null;
  return {
    host: row.imapHost,
    port: row.imapPort,
    security: row.imapSecurity,
    username: row.imapUsername || row.email,
    password,
    accessToken,
  };
}

/** One pass of the inbox.poll job. */
export async function runInboxPoll(db: AppDatabase, encryptionKey: Buffer): Promise<void> {
  const rows = await db
    .select({
      id: mailboxes.id,
      email: mailboxes.email,
      health: mailboxes.health,
      consecutiveAuthFailures: mailboxes.consecutiveAuthFailures,
      lastSeenImapUid: mailboxes.lastSeenImapUid,
      imapUidValidity: mailboxes.imapUidValidity,
      imapHost: mailboxes.imapHost,
      imapPort: mailboxes.imapPort,
      imapSecurity: mailboxes.imapSecurity,
      imapUsername: mailboxes.imapUsername,
      imapPasswordEncrypted: mailboxes.imapPasswordEncrypted,
      oauthAccessTokenEncrypted: mailboxes.oauthAccessTokenEncrypted,
      oauthAccessTokenExpiresAt: mailboxes.oauthAccessTokenExpiresAt,
    })
    .from(mailboxes);
  const sentMessages = await loadSentMessages(db);

  for (const row of rows) {
    const cursor = {
      id: row.id,
      paused: row.health === "paused",
      consecutiveAuthFailures: row.consecutiveAuthFailures,
      lastSeenUid: row.lastSeenImapUid,
      uidValidity: row.imapUidValidity,
    };
    if (cursor.paused) {
      const skipped = await pollMailbox({
        mailbox: cursor,
        sentMessages,
        listUids: async () => [],
        fetchRaw: async () => "",
        store: createInboxPollStore(db, row.imapUidValidity),
      });
      for (const line of skipped.logs) console.log(line);
      continue;
    }

    const connection = connectionFor(row, encryptionKey);
    if (!connection) {
      const reason = row.oauthAccessTokenExpiresAt && row.oauthAccessTokenExpiresAt.getTime() <= Date.now() ? "oauth_expired" : "no_credentials";
      console.log(`[inbox] event=skipped reason=${reason} mailbox=${row.id}`);
      continue;
    }

    let opened: Awaited<ReturnType<typeof openImap>> | null = null;
    try {
      try {
        opened = await openImap(connection);
      } catch (error) {
        if (error instanceof ImapAuthError) {
          const failed = await pollMailbox({
            mailbox: cursor,
            sentMessages,
            listUids: async () => {
              throw error;
            },
            fetchRaw: async () => {
              throw error;
            },
            store: createInboxPollStore(db, row.imapUidValidity),
          });
          for (const line of failed.logs) console.log(line);
          continue;
        }
        console.log(`[inbox] event=connect_failed mailbox=${row.id}`);
        continue;
      }

      if (!opened) continue;
      const uidValidity = opened.uidValidity ?? row.imapUidValidity;
      const validityChanged =
        row.imapUidValidity !== null && opened.uidValidity !== null && row.imapUidValidity !== opened.uidValidity;
      const mailbox = validityChanged ? { ...cursor, lastSeenUid: null, uidValidity } : { ...cursor, uidValidity };
      if (validityChanged) {
        console.log(`[inbox] event=uid_validity_changed mailbox=${row.id}`);
      }
      const session = opened;
      const result = await pollMailbox({
        mailbox,
        sentMessages,
        listUids: () => session.listUids(),
        fetchRaw: (uid) => session.fetchRaw(uid),
        store: createInboxPollStore(db, uidValidity),
      });
      for (const line of result.logs) console.log(line);
      await db.insert(auditLog).values({
        category: "job",
        actorType: "worker",
        action: "inbox.poll",
        entityType: "mailbox",
        entityId: row.id,
        detail: {
          processed: result.processed,
          paused: result.paused,
          lastSeenUid: result.lastSeenUid,
        },
      });
    } finally {
      await opened?.close();
    }
  }
}
