import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export function migrationsFolder(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
}

/** Any fixed number works; every process that migrates takes the same lock. */
const MIGRATION_LOCK_KEY = 7_405_115_001;

/**
 * The app and the worker both call this on start. On a brand-new database they would otherwise run the
 * same CREATE TABLE statements at the same moment and one of them crashes. A session advisory lock makes
 * the second process wait until the first has finished, then its migrate() is a no-op.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  // onnotice: Postgres prints "already exists, skipping" notices on every start; they are not errors.
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await client`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    try {
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: migrationsFolder() });
      await client`insert into settings (id) values ('default') on conflict (id) do nothing`;
    } finally {
      await client`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}
