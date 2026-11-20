import { ApiError, errorBody } from "../api/errors.js";
import { rejectLimitFields } from "../api/limits.js";
import type { AppServices } from "../api/services.js";
import { WarmySenderApiError, createWarmySenderClient, type FetchLike } from "./client.js";
import { LEADS_IMPORT_MESSAGE, LEADS_SEARCH_URL } from "./links.js";
import {
  KeyShapeError,
  connectCard,
  connectWarmySender,
  disconnectWarmySender,
  warmySenderStatus,
  type WarmySenderKeyStore,
} from "./settings.js";
import { nextContactStatus, verifyAddresses } from "./verification.js";
import { warmUpMailbox, type WarmupMailboxInput } from "./warmup.js";

export type WarmupLinkStore = {
  get(localMailboxId: string): Promise<string | null>;
  set(localMailboxId: string, warmyMailboxId: string): Promise<void>;
};

export type WarmyHttpDeps = {
  services: AppServices;
  keys: WarmySenderKeyStore;
  links: WarmupLinkStore;
  getMailbox(id: string): Promise<WarmupMailboxInput | null>;
  fetchImpl?: FetchLike;
};

export async function handleWarmySenderHttp(
  deps: WarmyHttpDeps,
  request: { method: string; path: string; body: unknown },
): Promise<{ status: number; body: unknown }> {
  const method = request.method.toUpperCase();
  const path = request.path.replace(/\/$/, "") || "/";
  try {
    rejectLimitFields(request.body);
    if (method === "GET" && path === "/api/settings/warmysender") {
      return { status: 200, body: { data: await warmySenderStatus(deps.keys) } };
    }
    if (method === "PUT" && path === "/api/settings/warmysender") {
      const apiKey = readKey(request.body);
      const connected = await connectWarmySender(deps.keys, apiKey, { fetchImpl: deps.fetchImpl });
      return { status: 200, body: { data: connected } };
    }
    if (method === "DELETE" && path === "/api/settings/warmysender") {
      return { status: 200, body: { data: await disconnectWarmySender(deps.keys) } };
    }
    if (method === "GET" && path === "/api/warmysender/mailboxes") {
      const rows = await deps.services.mailboxes.list();
      return {
        status: 200,
        body: { data: rows.map((row) => ({ id: row.id, email: row.email, kind: row.provider })) },
      };
    }
    if (method === "GET" && path === "/api/warmysender/leads") {
      const status = await warmySenderStatus(deps.keys);
      if (!status.connected) return { status: 200, body: { data: { connected: false, card: connectCard("leads") } } };
      return {
        status: 200,
        body: { data: { connected: true, url: LEADS_SEARCH_URL, message: LEADS_IMPORT_MESSAGE } },
      };
    }
    if (method === "POST" && path === "/api/warmysender/verify") {
      return await verify(deps, request.body);
    }
    const warmupId = /^\/api\/warmysender\/mailboxes\/([^/]+)\/warmup$/.exec(path)?.[1];
    if (warmupId && method === "POST") return await postWarmup(deps, decodeURIComponent(warmupId), request.body);
    if (warmupId && method === "GET") return await getWarmup(deps, decodeURIComponent(warmupId));
    throw new ApiError(404, "not_found", "No such WarmySender route.");
  } catch (error) {
    if (error instanceof ApiError) return { status: error.status, body: errorBody(error) };
    if (error instanceof KeyShapeError) return { status: 400, body: errorBody(new ApiError(400, "validation_error", error.message)) };
    if (error instanceof WarmySenderApiError) {
      const status = error.status === 401 ? 502 : error.status;
      return { status, body: errorBody(new ApiError(status, error.code, error.message)) };
    }
    return { status: 500, body: errorBody(new ApiError(500, "internal_error", "Something went wrong.")) };
  }
}

async function verify(deps: WarmyHttpDeps, body: unknown): Promise<{ status: number; body: unknown }> {
  const status = await warmySenderStatus(deps.keys);
  if (!status.connected) return { status: 200, body: { data: { connected: false, card: connectCard("verify") } } };
  const key = await deps.keys.getKey();
  if (!key) return { status: 200, body: { data: { connected: false, card: connectCard("verify") } } };

  const object = objectBody(body);
  let emails: string[];
  if (typeof object.list_id === "string" && object.list_id.length > 0) {
    const fromList = await deps.services.lists.emails(object.list_id);
    if (!fromList) throw new ApiError(404, "not_found", "List not found.");
    emails = fromList;
  } else if (Array.isArray(object.emails)) {
    emails = object.emails.filter((item): item is string => typeof item === "string");
  } else {
    throw new ApiError(400, "validation_error", "Provide emails or list_id.");
  }
  if (emails.length === 0) throw new ApiError(400, "validation_error", "There are no addresses to verify.");

  const client = createWarmySenderClient({ apiKey: key, fetchImpl: deps.fetchImpl });
  const result = await verifyAddresses(client, { emails, name: typeof object.name === "string" ? object.name : undefined });
  if (!result.ok) {
    return { status: 409, body: { data: result } };
  }

  const contacts = await deps.services.contacts.findByEmails(result.results.map((item) => item.email));
  const byEmail = new Map(contacts.map((contact) => [contact.email.toLowerCase(), contact]));
  const updates: { email: string; status: string; verification: string }[] = [];
  for (const item of result.results) {
    const contact = byEmail.get(item.email.toLowerCase());
    if (!contact) continue;
    const next = nextContactStatus(contact.status, item.status);
    if (!next) continue;
    await deps.services.contacts.updateStatus(contact.id, next);
    updates.push({ email: contact.email, status: next, verification: item.status });
  }
  return {
    status: 200,
    body: {
      data: {
        connected: true,
        batch_id: result.batch_id,
        batch_status: result.batch_status,
        incomplete: result.incomplete,
        updates,
      },
    },
  };
}

async function postWarmup(
  deps: WarmyHttpDeps,
  mailboxId: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const status = await warmySenderStatus(deps.keys);
  if (!status.connected) return { status: 200, body: { data: { connected: false, card: connectCard("warmup") } } };
  const mailbox = await deps.getMailbox(mailboxId);
  if (!mailbox) throw new ApiError(404, "not_found", "Mailbox not found.");
  const confirmed = objectBody(body ?? {}).confirmed === true;
  if (mailbox.kind === "microsoft") {
    const outcome = await warmUpMailbox(unusedClient(), mailbox, { confirmed: false });
    return { status: 200, body: { data: outcome } };
  }
  if (!confirmed) {
    const outcome = await warmUpMailbox(unusedClient(), mailbox, { confirmed: false });
    return { status: 200, body: { data: outcome } };
  }
  const key = await deps.keys.getKey();
  if (!key) return { status: 200, body: { data: { connected: false, card: connectCard("warmup") } } };
  const client = createWarmySenderClient({ apiKey: key, fetchImpl: deps.fetchImpl });
  const outcome = await warmUpMailbox(client, mailbox, { confirmed: true });
  if (outcome.status !== "confirmation_required" && outcome.status !== "microsoft" && outcome.status !== "missing_login") {
    await deps.links.set(mailboxId, outcome.warmysender_mailbox_id);
  }
  return { status: 200, body: { data: outcome } };
}

async function getWarmup(deps: WarmyHttpDeps, mailboxId: string): Promise<{ status: number; body: unknown }> {
  const status = await warmySenderStatus(deps.keys);
  if (!status.connected) return { status: 200, body: { data: { connected: false, card: connectCard("warmup") } } };
  const key = await deps.keys.getKey();
  const warmyId = await deps.links.get(mailboxId);
  if (!key || !warmyId) throw new ApiError(404, "not_found", "This mailbox is not warming up in WarmySender yet.");
  const client = createWarmySenderClient({ apiKey: key, fetchImpl: deps.fetchImpl });
  const stats = await client.getWarmupStats(warmyId);
  return { status: 200, body: { data: stats } };
}

function unusedClient() {
  return createWarmySenderClient({
    apiKey: "ws_unused",
    fetchImpl: () => {
      throw new Error("WarmySender was called without a confirmed SMTP warmup.");
    },
  });
}

function readKey(body: unknown): string {
  const object = objectBody(body);
  if (typeof object.api_key !== "string") throw new ApiError(400, "validation_error", "api_key is required.");
  return object.api_key;
}

function objectBody(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) return {};
  if (typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "validation_error", "Body must be a JSON object.");
  return body as Record<string, unknown>;
}
