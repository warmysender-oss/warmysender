import { errorBody, ApiError } from "./errors.js";
import { handleMcpMessage } from "../mcp/jsonrpc.js";
import type { AppServices } from "./services.js";
import { handleApiV1 } from "./v1.js";
import { handleWarmySenderHttp, type WarmyHttpDeps } from "../warmysender/http.js";

export type DispatchDeps = {
  services: AppServices;
  authenticateApiKey(token: string): Promise<{ userId: string } | null>;
  authenticateSession(headers: Record<string, string | undefined>): Promise<{ userId: string } | null>;
  warmy: Omit<WarmyHttpDeps, "services">;
};

export type HttpResponse = { status: number; headers: Record<string, string>; body: unknown };

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

/**
 * Returns null when the path belongs to another part of the app.
 * API-key routes: /api/v1 and /mcp. Session routes: WarmySender settings and actions.
 */
export async function dispatch(deps: DispatchDeps, request: {
  method: string;
  url: string;
  headers: Record<string, string | undefined>;
  body: unknown;
}): Promise<HttpResponse | null> {
  const url = new URL(request.url, "http://localhost");
  const path = url.pathname;

  try {
    if (path === "/mcp") return await mcp(deps, request);
    if (path === "/api/v1" || path.startsWith("/api/v1/")) return await apiV1(deps, request, url);
    if (path.startsWith("/api/settings/warmysender") || path.startsWith("/api/warmysender")) {
      return await warmy(deps, request, path);
    }
    return null;
  } catch (error) {
    if (error instanceof ApiError) return json(error.status, errorBody(error));
    return json(500, errorBody(new ApiError(500, "internal_error", "Something went wrong.")));
  }
}

async function apiV1(deps: DispatchDeps, request: { method: string; headers: Record<string, string | undefined>; body: unknown }, url: URL): Promise<HttpResponse> {
  const user = await deps.authenticateApiKey(bearer(request.headers) ?? "");
  if (!user) return json(401, errorBody(new ApiError(401, "unauthorized", "Missing or invalid API key.")));
  const suffix = url.pathname.slice("/api/v1".length) || "/";
  const result = await handleApiV1(deps.services, {
    method: request.method,
    path: suffix,
    query: url.searchParams,
    body: request.body,
  });
  return json(result.status, result.body);
}

async function mcp(deps: DispatchDeps, request: { method: string; headers: Record<string, string | undefined>; body: unknown }): Promise<HttpResponse> {
  if (request.method.toUpperCase() !== "POST") {
    return { status: 405, headers: { ...JSON_HEADERS, allow: "POST" }, body: errorBody(new ApiError(405, "method_not_allowed", "POST JSON-RPC to /mcp.")) };
  }
  const user = await deps.authenticateApiKey(bearer(request.headers) ?? "");
  if (!user) return json(401, errorBody(new ApiError(401, "unauthorized", "Missing or invalid API key.")));
  const message = await handleMcpMessage(deps.services, request.body);
  if (message === null) return { status: 202, headers: JSON_HEADERS, body: null };
  return json(200, message);
}

async function warmy(deps: DispatchDeps, request: { method: string; headers: Record<string, string | undefined>; body: unknown }, path: string): Promise<HttpResponse> {
  const user = await deps.authenticateSession(request.headers);
  if (!user) return json(401, errorBody(new ApiError(401, "unauthorized", "Sign in to use WarmySender connect.")));
  const result = await handleWarmySenderHttp({ ...deps.warmy, services: deps.services }, { method: request.method, path, body: request.body });
  return json(result.status, result.body);
}

function json(status: number, body: unknown): HttpResponse {
  return { status, headers: JSON_HEADERS, body };
}

function bearer(headers: Record<string, string | undefined>): string | null {
  const value = header(headers, "authorization");
  if (!value) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(value);
  return match ? match[1] : null;
}

function header(headers: Record<string, string | undefined>, name: string): string | undefined {
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return found?.[1];
}
