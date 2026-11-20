import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { hashToken, sessions, users, type AppDatabase } from "@warmysender/core";
import { readSessionCookie } from "./cookies.js";
import { HttpError, publicUser } from "./http.js";

export function attachUser(db: AppDatabase) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = readSessionCookie(req.headers.cookie);
    if (!token) {
      next();
      return;
    }
    const tokenHash = hashToken(token);
    void db
      .select({ user: users, expiresAt: sessions.expiresAt })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1)
      .then((rows) => {
        const row = rows[0];
        if (!row) return;
        if (row.expiresAt.getTime() <= Date.now()) return;
        req.user = publicUser(row.user);
      })
      .then(() => next())
      .catch(next);
  };
}

export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new HttpError(401, "Sign in required."));
    return;
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new HttpError(401, "Sign in required."));
    return;
  }
  if (req.user.role !== "admin") {
    next(new HttpError(403, "An admin has to do that."));
    return;
  }
  next();
}
