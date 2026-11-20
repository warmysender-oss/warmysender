import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { apiKeys, auditLog, generateApiKey, type AppDatabase } from "@warmysender/core";
import { HttpError } from "../http.js";
import { requireUser } from "../middleware.js";

function presentKey(row: typeof apiKeys.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.keyPrefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

export function apiKeysRouter(db: AppDatabase): Router {
  const router = Router();
  router.use(requireUser);

  router.get("/", async (_req, res, next) => {
    try {
      const rows = await db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
      res.json({ apiKeys: rows.map(presentKey) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) throw new HttpError(401, "Sign in required.");
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (name.length < 1 || name.length > 80) {
        throw new HttpError(400, "Name the key with 1 to 80 characters.");
      }
      const generated = generateApiKey();
      const [row] = await db
        .insert(apiKeys)
        .values({
          name,
          keyPrefix: generated.prefix,
          keyHash: generated.hash,
          createdBy: user.id,
        })
        .returning();
      if (!row) throw new Error("API key insert did not return a row.");
      await db.insert(auditLog).values({
        category: "audit",
        actorType: "user",
        actorId: user.id,
        action: "api_key.create",
        entityType: "api_key",
        entityId: row.id,
        detail: { name, prefix: generated.prefix },
      });
      res.status(201).json({ ...presentKey(row), key: generated.plaintext });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) throw new HttpError(401, "Sign in required.");
      const id = req.params.id;
      if (!id) throw new HttpError(400, "API key id is required.");
      const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
      if (!row) throw new HttpError(404, "API key not found.");
      if (!row.revokedAt) {
        await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
        await db.insert(auditLog).values({
          category: "audit",
          actorType: "user",
          actorId: user.id,
          action: "api_key.revoke",
          entityType: "api_key",
          entityId: id,
        });
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
