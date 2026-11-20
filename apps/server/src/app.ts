import { existsSync } from "node:fs";
import { join } from "node:path";
import express, { type ErrorRequestHandler, type Express } from "express";
import type { Config, AppDatabase } from "@warmysender/core";
import { HttpError } from "./http.js";
import { attachUser } from "./middleware.js";
import { campaignsRouter } from "./campaigns/routes.js";
import { contactsRouter } from "./contacts/routes.js";
import { mountAgentApi } from "./api/mount.js";
import { inboxRouter } from "./inbox/routes.js";
import { mailRouter, type MailRouterOptions } from "./mailboxes/router.js";
import { apiKeysRouter } from "./routes/api-keys.js";
import { authRouter } from "./routes/auth.js";
import { invitesRouter } from "./routes/invites.js";
import type { FetchLike } from "./warmysender/client.js";
import type { ReplyTransport } from "./inbox/send-reply.js";
import { setupRouter, statsRouter } from "./stats/routes.js";
import "./types.js";

export type CreateAppOptions = {
  db: AppDatabase;
  config: Config;
  serveWeb: boolean;
  webDist: string;
  /** Tests pass a fake sender. Production uses SMTP from the mailbox that owns the thread. */
  replyTransport?: ReplyTransport;
  mail?: MailRouterOptions;
  /** Test double for WarmySender. Production uses the platform fetch. */
  warmyFetch?: FetchLike;
};

function findHttpError(error: unknown): HttpError | null {
  if (error instanceof HttpError) return error;
  if (typeof error === "object" && error !== null && "cause" in error) {
    return findHttpError((error as { cause?: unknown }).cause);
  }
  return null;
}

export function createApp(options: CreateAppOptions): Express {
  const { db, config } = options;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(attachUser(db));

  app.get(["/health", "/api/health"], (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/auth", authRouter(db, config));
  app.use("/api/invites", invitesRouter(db, config));
  app.use("/api/api-keys", apiKeysRouter(db));
  app.use("/api/inbox", inboxRouter(db, config, options.replyTransport));
  app.use("/api/stats", statsRouter(db));
  app.use("/api/setup", setupRouter(db));
  app.use("/api/contacts", contactsRouter(db));
  app.use("/api/campaigns", campaignsRouter(db, config.publicUrl));
  app.use(mailRouter(db, config, options.mail));
  mountAgentApi(app, { db, config, fetchImpl: options.warmyFetch });

  if (options.serveWeb && existsSync(options.webDist)) {
    app.use(express.static(options.webDist));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        next();
        return;
      }
      if (req.path.startsWith("/api") || req.path === "/mcp" || req.path === "/health") {
        next();
        return;
      }
      res.sendFile(join(options.webDist, "index.html"), (error) => {
        if (error) next(error);
      });
    });
  }

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const httpError = findHttpError(err);
    if (httpError) {
      res.status(httpError.status).json({ error: httpError.message });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "Request body must be JSON." });
      return;
    }
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[server] request failed: ${message}`);
    res.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);
  return app;
}
