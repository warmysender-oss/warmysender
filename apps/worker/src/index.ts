import { PgBoss } from "pg-boss";
import { createDb, loadConfig, runMigrations, writeHeartbeat } from "@warmysender/core";
import { INBOX_POLL_JOB } from "./inbox/index.js";
import { runInboxPoll } from "./inbox/run.js";

export const HEARTBEAT_QUEUE = "heartbeat";

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.usingDevSecrets) {
    console.warn(
      "[security] Using the development ENCRYPTION_KEY or SESSION_SECRET. Fine on localhost. Set unique values before exposing this server.",
    );
  }
  await runMigrations(config.databaseUrl);
  const { db, close } = createDb(config.databaseUrl);
  const boss = new PgBoss({ connectionString: config.databaseUrl });
  boss.on("error", (error: Error) => {
    console.error(`[worker] queue error: ${error.message}`);
  });
  await boss.start();
  await boss.createQueue(HEARTBEAT_QUEUE);
  await boss.work(HEARTBEAT_QUEUE, async () => {
    await writeHeartbeat(db);
    console.log(`[worker] heartbeat at=${new Date().toISOString()}`);
  });
  await boss.schedule(HEARTBEAT_QUEUE, "* * * * *");
  await boss.send(HEARTBEAT_QUEUE, {});
  await boss.createQueue(INBOX_POLL_JOB);
  await boss.work(INBOX_POLL_JOB, async () => {
    await runInboxPoll(db, config.encryptionKey);
  });
  await boss.schedule(INBOX_POLL_JOB, "*/5 * * * *");
  await boss.send(INBOX_POLL_JOB, {});
  console.log("[worker] started");

  const shutdown = (signal: string) => {
    console.log(`[worker] ${signal}, closing`);
    void boss
      .stop()
      .then(() => close())
      .finally(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`[worker] failed to start: ${message}`);
  process.exit(1);
});
