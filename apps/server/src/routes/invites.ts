import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import {
  auditLog,
  generateToken,
  hashToken,
  invites,
  type AppDatabase,
  type Config,
} from "@warmysender/core";
import { HttpError, normalizeEmail } from "../http.js";
import { requireAdmin } from "../middleware.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function presentInvite(row: typeof invites.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function invitesRouter(db: AppDatabase, config: Config): Router {
  const router = Router();

  router.post("/preview", async (req, res, next) => {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      if (!token) throw new HttpError(400, "Invite token is required.");
      const [invite] = await db.select().from(invites).where(eq(invites.tokenHash, hashToken(token))).limit(1);
      if (!invite || invite.acceptedAt || invite.expiresAt.getTime() <= Date.now()) {
        throw new HttpError(404, "This invite link is invalid or already used.");
      }
      res.json({
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.use(requireAdmin);

  router.get("/", async (_req, res, next) => {
    try {
      const rows = await db.select().from(invites).orderBy(desc(invites.createdAt));
      res.json({ invites: rows.map(presentInvite) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const admin = req.user;
      if (!admin) throw new HttpError(401, "Sign in required.");
      let email: string | null = null;
      if (req.body?.email !== undefined && req.body?.email !== null && req.body?.email !== "") {
        email = normalizeEmail(req.body.email);
        if (!email) throw new HttpError(400, "Enter a valid email address, or leave it blank.");
      }
      const role = req.body?.role === "admin" ? "admin" : "member";
      if (req.body?.role !== undefined && req.body?.role !== "admin" && req.body?.role !== "member") {
        throw new HttpError(400, "Role must be admin or member.");
      }
      const token = generateToken("inv");
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      const [invite] = await db
        .insert(invites)
        .values({
          tokenHash: token.hash,
          email,
          role,
          createdBy: admin.id,
          expiresAt,
        })
        .returning();
      if (!invite) throw new Error("Invite insert did not return a row.");
      await db.insert(auditLog).values({
        category: "audit",
        actorType: "user",
        actorId: admin.id,
        action: "invite.create",
        entityType: "invite",
        entityId: invite.id,
        detail: { role, email },
      });
      res.status(201).json({
        ...presentInvite(invite),
        token: token.plaintext,
        url: `${config.publicUrl}/invite/${token.plaintext}`,
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      if (!id) throw new HttpError(400, "Invite id is required.");
      const deleted = await db.delete(invites).where(eq(invites.id, id)).returning({ id: invites.id });
      if (!deleted[0]) throw new HttpError(404, "Invite not found.");
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
