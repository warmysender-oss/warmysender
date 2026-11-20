import type { Request } from "express";
import { Router } from "express";
import {
  createNodeDnsResolver,
  decryptString,
  encryptString,
  type AppDatabase,
  type Config,
  type DnsResolver,
} from "@warmysender/core";
import { isUniqueViolation } from "../http.js";
import { createDrizzleMailboxStore } from "./drizzle-store.js";
import { probeImap, probeSmtp } from "./probes.js";
import { handleMailHttp, type MailHttpDeps } from "./routes.js";
import type { MailboxProbes } from "./test-connection.js";

export type MailRouterOptions = {
  resolver?: DnsResolver;
  probes?: MailboxProbes;
};

export function mailRouter(db: AppDatabase, config: Config, options: MailRouterOptions = {}): Router {
  const deps = createMailDeps(db, config, options);
  const router = Router();
  router.use(async (req, res, next) => {
    const path = req.originalUrl.split("?")[0] ?? req.path;
    if (!path.startsWith("/api/mailboxes") && !path.startsWith("/api/oauth/microsoft")) {
      next();
      return;
    }
    try {
      const result = await handleMailHttp(
        {
          method: req.method,
          path,
          query: queryFrom(req),
          body: req.body,
          userId: req.user?.id ?? null,
        },
        deps,
      );
      if (result.redirect) {
        res.redirect(result.status, result.redirect);
        return;
      }
      res.status(result.status).json(result.body ?? {});
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "A mailbox for this address already exists." });
        return;
      }
      next(error);
    }
  });
  return router;
}

function createMailDeps(db: AppDatabase, config: Config, options: MailRouterOptions): MailHttpDeps {
  const store = createDrizzleMailboxStore(db);
  return {
    store,
    codec: {
      encrypt: (plain) => encryptString(plain, config.encryptionKey),
      decrypt: (payload) => decryptString(payload, config.encryptionKey),
    },
    probes: options.probes ?? { smtp: probeSmtp, imap: probeImap },
    resolver: options.resolver ?? createNodeDnsResolver(),
    now: () => new Date(),
    env: () => ({
      clientId: config.msClientId ?? undefined,
      clientSecret: config.msClientSecret ?? undefined,
      tenant: config.msTenant,
      publicUrl: config.publicUrl,
      sessionSecret: config.sessionSecret,
    }),
    fetchToken: async (request) => {
      const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: request.body,
      });
      return response.json() as Promise<unknown>;
    },
  };
}

function queryFrom(req: Request): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value) && typeof value[0] === "string") out[key] = value[0];
  }
  return out;
}
