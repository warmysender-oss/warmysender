import { sql } from "drizzle-orm";
import {
  checkDeliverability,
  createDb,
  createNodeDnsResolver,
  decryptString,
  encryptString,
  loadConfig,
  spfExampleForPreset,
} from "@warmysender/core";
import { runDoctor } from "./doctor.js";
import { probeImap, probeSmtp } from "./probes.js";
import { createDrizzleMailboxStore, latestHeartbeatAt } from "./drizzle-store.js";

export async function runWiredDoctor(): Promise<number> {
  const report = await runDoctor({
    env: process.env,
    now: new Date(),
    database: pingDatabase,
    workerHeartbeatAt: readHeartbeat,
    fetchPublicUrl: fetchPublic,
    mailboxes: loadMailboxes,
  });
  process.stdout.write(`${report.text}\n`);
  return report.ok ? 0 : 1;
}

async function pingDatabase(): Promise<{ ok: boolean; detail: string }> {
  try {
    const config = loadConfig();
    const { db, close } = createDb(config.databaseUrl);
    try {
      await db.execute(sql`select 1`);
      return { ok: true, detail: "Postgres answered." };
    } finally {
      await close();
    }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Database check failed." };
  }
}

async function readHeartbeat(): Promise<Date | null> {
  try {
    const config = loadConfig();
    const { db, close } = createDb(config.databaseUrl);
    try {
      return await latestHeartbeatAt(db);
    } finally {
      await close();
    }
  } catch {
    return null;
  }
}

async function loadMailboxes() {
  try {
    const config = loadConfig();
    const { db, close } = createDb(config.databaseUrl);
    try {
    const store = createDrizzleMailboxStore(db);
    const rows = await store.list();
    const codec = {
      encrypt: (plain: string) => encryptString(plain, config.encryptionKey),
      decrypt: (payload: string) => decryptString(payload, config.encryptionKey),
    };
    return rows.map((row) => ({
      email: row.email,
      paused: row.health === "paused",
      pauseReason: row.pausedReason,
      test: async () => {
        if (row.provider === "microsoft") {
          const token = row.oauthAccessTokenEncrypted ? codec.decrypt(row.oauthAccessTokenEncrypted) : "";
          const { testMailboxConnection } = await import("./test-connection.js");
          return testMailboxConnection(
            {
              smtp: { host: row.smtpHost, port: row.smtpPort, security: row.smtpSecurity, username: row.smtpUsername, password: token, auth: "xoauth2" },
              imap: { host: row.imapHost, port: row.imapPort, security: row.imapSecurity, username: row.imapUsername, password: token, auth: "xoauth2" },
            },
            { smtp: probeSmtp, imap: probeImap },
          );
        }
        const smtpPassword = row.smtpPasswordEncrypted ? codec.decrypt(row.smtpPasswordEncrypted) : "";
        const imapPassword = row.imapPasswordEncrypted ? codec.decrypt(row.imapPasswordEncrypted) : "";
        const { testMailboxConnection } = await import("./test-connection.js");
        return testMailboxConnection(
          {
            smtp: { host: row.smtpHost, port: row.smtpPort, security: row.smtpSecurity, username: row.smtpUsername, password: smtpPassword, auth: "password" },
            imap: { host: row.imapHost, port: row.imapPort, security: row.imapSecurity, username: row.imapUsername, password: imapPassword, auth: "password" },
          },
          { smtp: probeSmtp, imap: probeImap },
        );
      },
      dns: () => checkDeliverability(row.email, createNodeDnsResolver(), spfExampleForPreset(row.provider)),
    }));
    } finally {
      await close();
    }
  } catch {
    return [];
  }
}

async function fetchPublic(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8_000) });
    return { ok: true, detail: `${url} responded with HTTP ${response.status}.` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "The request failed." };
  }
}
