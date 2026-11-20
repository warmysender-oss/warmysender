import { sql } from "drizzle-orm";
import { SEND_CLAIM_MS, type AppDatabase } from "@warmysender/core";

/**
 * Claim mailboxes for this tick.
 * FOR UPDATE SKIP LOCKED stops two transactions from taking the same row.
 * send_claim_until keeps the claim after commit, so the SMTP call does not
 * need to hold the database transaction open.
 */
export async function claimMailboxes(
  db: AppDatabase,
  ids: readonly string[],
  now: Date,
): Promise<{ ids: string[]; until: Date }> {
  const unique = [...new Set(ids)];
  const until = new Date(now.getTime() + SEND_CLAIM_MS);
  if (unique.length === 0) return { ids: [], until };
  const result = await db.execute<{ id: string }>(sql`
    WITH locked AS (
      SELECT id FROM mailboxes
      WHERE id IN (${sql.join(unique.map((id) => sql`${id}::uuid`), sql`, `)})
        AND (send_claim_until IS NULL OR send_claim_until <= ${now})
      FOR UPDATE SKIP LOCKED
    )
    UPDATE mailboxes
    SET send_claim_until = ${until}
    WHERE id IN (SELECT id FROM locked)
    RETURNING id
  `);
  return { ids: rowsOf<{ id: string }>(result).map((row) => row.id), until };
}

export async function releaseMailboxClaims(
  db: AppDatabase,
  ids: readonly string[],
  until: Date,
): Promise<void> {
  if (ids.length === 0) return;
  await db.execute(sql`
    UPDATE mailboxes
    SET send_claim_until = NULL
    WHERE id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
      AND send_claim_until = ${until}
  `);
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}
