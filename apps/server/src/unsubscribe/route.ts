import { Router } from "express";
import express from "express";
import { and, eq } from "drizzle-orm";
import {
  contacts,
  enrollments,
  handleUnsubscribeRequest,
  hashToken,
  suppressions,
  unsubscribeTokens,
  type AppDatabase,
  type ContactStatus,
} from "@warmysender/core";

export function unsubscribeRouter(db: AppDatabase): Router {
  const router = Router();
  router.use(express.urlencoded({ extended: false }));
  router.all("/u/:token", async (req, res, next) => {
    try {
      const raw = req.params.token;
      const token = Array.isArray(raw) ? raw[0] : raw;
      if (!token) {
        res.status(404).type("application/json").send(JSON.stringify({ ok: false, error: "invalid_token" }));
        return;
      }
      const found = await db
        .select({
          tokenId: unsubscribeTokens.id,
          contactId: unsubscribeTokens.contactId,
          email: contacts.email,
          status: contacts.status,
        })
        .from(unsubscribeTokens)
        .innerJoin(contacts, eq(contacts.id, unsubscribeTokens.contactId))
        .where(eq(unsubscribeTokens.tokenHash, hashToken(token)))
        .limit(1);
      const row = found[0];
      const rawBody = typeof req.body === "string" ? req.body : new URLSearchParams(formBody(req.body)).toString();
      const result = handleUnsubscribeRequest({
        method: req.method,
        contentType: req.header("content-type") ?? null,
        rawBody,
        contact: row
          ? { contactId: row.contactId, email: row.email, status: row.status as ContactStatus }
          : null,
      });
      const effect = result.effect;
      if (effect && row) {
        const now = new Date();
        await db.transaction(async (tx) => {
          await tx
            .update(contacts)
            .set({ status: "unsubscribed", updatedAt: now })
            .where(eq(contacts.id, row.contactId));
          await tx
            .insert(suppressions)
            .values({ kind: "email", value: effect.suppressEmail, reason: "unsubscribe" })
            .onConflictDoNothing({ target: [suppressions.kind, suppressions.value] });
          await tx
            .update(enrollments)
            .set({ status: "stopped", stopReason: "unsubscribe", updatedAt: now })
            .where(and(eq(enrollments.contactId, row.contactId), eq(enrollments.status, "active")));
          await tx.update(unsubscribeTokens).set({ usedAt: now }).where(eq(unsubscribeTokens.id, row.tokenId));
        });
      }
      res.status(result.status).type(result.contentType).send(result.body);
    } catch (error) {
      next(error);
    }
  });
  return router;
}

function formBody(body: unknown): Record<string, string> {
  if (!body || typeof body !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
