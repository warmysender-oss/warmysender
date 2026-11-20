import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export function migrationsFolder(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
}

export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: migrationsFolder() });
    await client`insert into settings (id) values ('default') on conflict (id) do nothing`;
  } finally {
    await client.end({ timeout: 5 });
  }
}
