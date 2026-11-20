import imapflow from "imapflow";

// imapflow is CommonJS: named ESM imports fail in the compiled app (Node), so read them off the default export.
const { AuthenticationFailure, ImapFlow } = imapflow;
import { ImapAuthError } from "./poll.js";

export interface ImapConnection {
  host: string;
  port: number;
  /** 'starttls' | 'ssl' | 'none' */
  security: string;
  username: string;
  password: string | null;
  accessToken: string | null;
}

export interface OpenedImap {
  uidValidity: number | null;
  listUids(): Promise<number[]>;
  fetchRaw(uid: number): Promise<string>;
  close(): Promise<void>;
}

/** imapflow `secure` / `doSTARTTLS` for the mailbox security field. */
export function imapTlsOptions(security: string): { secure: boolean; doSTARTTLS: boolean } {
  if (security === "ssl") return { secure: true, doSTARTTLS: false };
  if (security === "none") return { secure: false, doSTARTTLS: false };
  return { secure: false, doSTARTTLS: true };
}

/** Postgres integer. UIDVALIDITY values outside int4 are ignored. */
export function uidValidityInt(value: bigint | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const asNumber = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(asNumber) || asNumber < 0 || asNumber > 2_147_483_647) return null;
  return asNumber;
}

function asAuthError(error: unknown): ImapAuthError | null {
  if (error instanceof ImapAuthError) return error;
  if (error instanceof AuthenticationFailure) return new ImapAuthError("IMAP authentication failed");
  return null;
}

export async function openImap(connection: ImapConnection): Promise<OpenedImap> {
  const tls = imapTlsOptions(connection.security);
  const auth = connection.accessToken
    ? { user: connection.username, accessToken: connection.accessToken }
    : { user: connection.username, pass: connection.password ?? "" };
  const client = new ImapFlow({
    host: connection.host,
    port: connection.port,
    secure: tls.secure,
    doSTARTTLS: tls.doSTARTTLS,
    auth,
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: 20_000,
    greetingTimeout: 16_000,
  });
  try {
    await client.connect();
  } catch (error) {
    const authError = asAuthError(error);
    client.close();
    if (authError) throw authError;
    throw error;
  }
  let lock: { release(): void } | null = null;
  try {
    lock = await client.getMailboxLock("INBOX");
  } catch (error) {
    const authError = asAuthError(error);
    client.close();
    if (authError) throw authError;
    throw error;
  }
  const box = client.mailbox;
  const uidValidity = uidValidityInt(box ? box.uidValidity : null);
  return {
    uidValidity,
    async listUids() {
      try {
        const found = await client.search({ all: true }, { uid: true });
        return found ? found : [];
      } catch (error) {
        const authError = asAuthError(error);
        if (authError) throw authError;
        throw error;
      }
    },
    async fetchRaw(uid: number) {
      try {
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!message || !message.source) throw new Error("IMAP message has no source");
        return message.source.toString("utf8");
      } catch (error) {
        const authError = asAuthError(error);
        if (authError) throw authError;
        throw error;
      }
    },
    async close() {
      lock?.release();
      lock = null;
      try {
        await client.logout();
      } catch {
        client.close();
      }
    },
  };
}
