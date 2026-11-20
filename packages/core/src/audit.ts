import type { AppDatabase } from "./db/client.js";
import { auditLog } from "./db/schema.js";

export type AuditEntry = {
  category: "audit" | "job";
  actorType: "user" | "api_key" | "system" | "worker";
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  detail?: Record<string, unknown>;
};

export async function writeAudit(db: AppDatabase, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    category: entry.category,
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    detail: entry.detail ?? {},
  });
}

export async function writeHeartbeat(db: AppDatabase, at: Date = new Date()): Promise<void> {
  await writeAudit(db, {
    category: "job",
    actorType: "worker",
    action: "heartbeat",
    detail: { at: at.toISOString() },
  });
}
