import type { Config, AppDatabase } from "@warmysender/core";
import type { Express, NextFunction, Request, Response } from "express";
import { errorBody, ApiError } from "./errors.js";
import { authenticateApiKey, createDbServices, createWarmyStores } from "./db-services.js";
import { dispatch } from "./dispatch.js";
import { handleMcpHttp } from "../mcp/http.js";
import type { FetchLike } from "../warmysender/client.js";

export function mountAgentApi(
  app: Express,
  options: { db: AppDatabase; config: Config; fetchImpl?: FetchLike },
): void {
  const services = createDbServices(options.db, { publicUrl: options.config.publicUrl });
  const stores = createWarmyStores(options.db, options.config.encryptionKey);

  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (!isAgentPath(req.path)) {
      next();
      return;
    }
    try {
      if (req.path === "/mcp") {
        const token = bearer(headerRecord(req));
        const user = token ? await authenticateApiKey(options.db, token) : null;
        if (!user) {
          res.status(401).json(errorBody(new ApiError(401, "unauthorized", "Missing or invalid API key.")));
          return;
        }
        await handleMcpHttp(services, req, res, req.body);
        return;
      }
      const response = await dispatch(
        {
          services,
          authenticateApiKey: (token) => authenticateApiKey(options.db, token),
          authenticateSession: async () => (req.user ? { userId: req.user.id } : null),
          warmy: {
            keys: stores.keys,
            links: stores.links,
            getMailbox: (id) => stores.getMailbox(id),
            fetchImpl: options.fetchImpl,
          },
        },
        {
          method: req.method,
          url: req.originalUrl || req.url,
          headers: headerRecord(req),
          body: req.body,
        },
      );
      if (!response) {
        next();
        return;
      }
      res.status(response.status);
      for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
      if (response.body === null) {
        res.end();
        return;
      }
      res.json(response.body);
    } catch (error) {
      next(error);
    }
  });
}

function isAgentPath(path: string): boolean {
  return path === "/mcp" || path.startsWith("/api/v1") || path.startsWith("/api/settings/warmysender") || path.startsWith("/api/warmysender");
}

function bearer(headers: Record<string, string | undefined>): string | null {
  const value = headers.authorization ?? headers.Authorization;
  if (!value) return null;
  return /^Bearer\s+(\S+)$/i.exec(value)?.[1] ?? null;
}

function headerRecord(req: Request): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    headers[name] = Array.isArray(value) ? value.join(", ") : value;
  }
  return headers;
}
