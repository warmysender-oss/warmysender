import { existsSync } from "node:fs";
import { createDb, loadConfig, runMigrations } from "@warmysender/core";
import { createApp } from "./app.js";
import { defaultWebDist } from "./paths.js";
import { seedDemoIfEmpty } from "./seed/seed-demo.js";

async function main(): Promise<void> {
  if (process.argv[2] === "doctor") {
    const { runWiredDoctor } = await import("./mailboxes/doctor-run.js");
    const code = await runWiredDoctor();
    process.exit(code);
  }
  const config = loadConfig();
  if (config.usingDevSecrets) {
    console.warn(
      "[security] Using the development ENCRYPTION_KEY or SESSION_SECRET. Fine on localhost. Set unique values before exposing this server.",
    );
  }
  await runMigrations(config.databaseUrl);
  const { db, close } = createDb(config.databaseUrl);
  if (config.nodeEnv !== "production") {
    const seeded = await seedDemoIfEmpty(db, config.encryptionKey);
    if (seeded.inserted) console.log("[seed] loaded .test demo contacts and a draft campaign");
  }
  const webDist = defaultWebDist();
  const app = createApp({ db, config, serveWeb: existsSync(webDist), webDist });
  const server = app.listen(config.port, config.host, () => {
    console.log(`[server] listening on http://${config.host}:${config.port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`[server] ${signal}, closing`);
    server.close(() => {
      void close().finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`[server] failed to start: ${message}`);
  process.exit(1);
});
