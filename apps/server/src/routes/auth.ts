import { eq, sql } from "drizzle-orm";
import { Router } from "express";
import {
  auditLog,
  generateToken,
  hashPassword,
  hashToken,
  invites,
  sessions,
  users,
  verifyPassword,
  type AppDatabase,
  type Config,
} from "@warmysender/core";
import { SESSION_MAX_AGE_SECONDS, clearSessionCookie, readSessionCookie, setSessionCookie } from "../cookies.js";
import { HttpError, isUniqueViolation, normalizeEmail, publicUser, readName, readPassword } from "../http.js";

/** Serializes account creation so two first visitors cannot both become admin. */
const REGISTER_LOCK = 841301;

export function authRouter(db: AppDatabase, config: Config): Router {
  const router = Router();

  router.get("/setup", async (_req, res, next) => {
    try {
      const [row] = await db.select({ value: sql<number>`cast(count(*) as int)` }).from(users);
      res.json({ hasUsers: Number(row?.value ?? 0) > 0 });
    } catch (error) {
      next(error);
    }
  });

  router.post("/register", async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = readPassword(req.body?.password);
      const name = readName(req.body?.name);
      const inviteToken = typeof req.body?.inviteToken === "string" ? req.body.inviteToken.trim() : "";
      if (!email) {
        throw new HttpError(400, "Enter a valid email address.");
      }
      if (!password) {
        throw new HttpError(400, "Password must be 10 to 200 characters.");
      }

      const created = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${REGISTER_LOCK})`);
        const [countRow] = await tx.select({ value: sql<number>`cast(count(*) as int)` }).from(users);
        const userCount = Number(countRow?.value ?? 0);
        let role: string;
        let inviteId: string | null = null;

        if (userCount === 0) {
          role = "admin";
        } else {
          if (!inviteToken) {
            throw new HttpError(403, "An invite link is required. The first account is already the admin.");
          }
          const tokenHash = hashToken(inviteToken);
          const [invite] = await tx.select().from(invites).where(eq(invites.tokenHash, tokenHash)).limit(1);
          if (!invite || invite.acceptedAt) {
            throw new HttpError(403, "This invite link is invalid or already used.");
          }
          if (invite.expiresAt.getTime() <= Date.now()) {
            throw new HttpError(403, "This invite link has expired.");
          }
          if (invite.email && invite.email !== email) {
            throw new HttpError(403, "This invite link is for a different email address.");
          }
          role = invite.role;
          inviteId = invite.id;
        }

        const passwordHash = hashPassword(password);
        let user;
        try {
          const inserted = await tx
            .insert(users)
            .values({ email, passwordHash, name, role })
            .returning();
          user = inserted[0];
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new HttpError(409, "An account with that email already exists.");
          }
          throw error;
        }
        if (!user) throw new Error("Account insert did not return a row.");

        if (inviteId) {
          await tx
            .update(invites)
            .set({ acceptedAt: new Date(), acceptedBy: user.id })
            .where(eq(invites.id, inviteId));
        }

        const session = generateToken("ses");
        const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
        await tx.insert(sessions).values({ userId: user.id, tokenHash: session.hash, expiresAt });
        await tx.insert(auditLog).values({
          category: "audit",
          actorType: "user",
          actorId: user.id,
          action: "user.register",
          entityType: "user",
          entityId: user.id,
          detail: { role },
        });
        return { user, token: session.plaintext };
      });

      setSessionCookie(res, created.token, config);
      res.status(201).json({ user: publicUser(created.user) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!email || !password) {
        throw new HttpError(401, "Invalid email or password.");
      }
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        throw new HttpError(401, "Invalid email or password.");
      }
      const session = generateToken("ses");
      const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
      await db.insert(sessions).values({ userId: user.id, tokenHash: session.hash, expiresAt });
      await db.insert(auditLog).values({
        category: "audit",
        actorType: "user",
        actorId: user.id,
        action: "user.login",
        entityType: "user",
        entityId: user.id,
      });
      setSessionCookie(res, session.plaintext, config);
      res.json({ user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", async (req, res, next) => {
    try {
      const token = readSessionCookie(req.headers.cookie);
      if (token) {
        await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
      }
      clearSessionCookie(res, config);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/me", (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Sign in required." });
      return;
    }
    res.json({ user: req.user });
  });

  return router;
}
