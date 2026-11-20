import assert from "node:assert/strict";
import { test } from "vitest";
import { dispatch } from "./dispatch.js";
import { ApiError } from "./errors.js";
import { createMemoryServices } from "./memory.js";
import { openApiDocument } from "./openapi.js";
import { API_ROUTES } from "./routes.js";
import { handleApiV1 } from "./v1.js";
import type { WarmyHttpDeps } from "../warmysender/http.js";

test("creating a contact rejects a limit field and never records a send", async () => {
  const memory = createMemoryServices();
  const denied = await handleApiV1(memory.services, {
    method: "POST",
    path: "/contacts",
    query: new URLSearchParams(),
    body: { email: "jane@harbor-dental.test", daily_cap: 500 },
  }).catch((error: unknown) => error);
  assert.ok(denied instanceof ApiError);
  assert.equal(denied.status, 403);
  assert.equal(denied.code, "limit_locked");
  assert.deepEqual(memory.calls, []);

  const created = await handleApiV1(memory.services, {
    method: "POST",
    path: "/contacts",
    query: new URLSearchParams(),
    body: { email: "Jane@Harbor-Dental.test", first_name: "Jane" },
  });
  assert.equal(created.status, 201);
  assert.equal((created.body as { data: { email: string } }).data.email, "jane@harbor-dental.test");
  assert.equal(mentionsSend(memory.calls), false);
});

test("start and draft do not send, and mailbox responses have no credentials", async () => {
  const memory = createMemoryServices();
  const campaign = await memory.services.campaigns.create({ name: "Harbor intro" });
  await memory.services.campaigns.addStep(campaign.id, { subject: "Hi", body: "Hello {{unsubscribe_link}}", delay_days: 0 });
  const blocked = await handleApiV1(memory.services, {
    method: "POST",
    path: `/campaigns/${campaign.id}/start`,
    query: new URLSearchParams(),
    body: {},
  });
  assert.equal(blocked.status, 409);
  assert.equal((blocked.body as { data: { started: boolean } }).data.started, false);

  await memory.services.campaigns.update(campaign.id, { mailbox_ids: ["box-1"] });
  const started = await handleApiV1(memory.services, {
    method: "POST",
    path: `/campaigns/${campaign.id}/start`,
    query: new URLSearchParams(),
    body: {},
  });
  assert.equal(started.status, 200);
  assert.equal((started.body as { data: { campaign: { status: string } } }).data.campaign.status, "running");
  assert.ok(memory.calls.includes("campaigns.start"));
  assert.equal(mentionsSend(memory.calls), false);

  const raised = await handleApiV1(memory.services, {
    method: "POST",
    path: `/campaigns/${campaign.id}/start`,
    query: new URLSearchParams(),
    body: { ramp_cap: 100 },
  }).catch((error: { status: number; code: string }) => error);
  assert.equal(raised.status, 403);

  memory.seedThread({
    id: "reply-1",
    mailbox_id: "box-1",
    contact_id: null,
    from_email: "jane@harbor-dental.test",
    subject: "Re: Hi",
    received_at: "2026-11-20T00:00:00.000Z",
    kind: "reply",
    messages: [],
  });
  const draft = await handleApiV1(memory.services, {
    method: "POST",
    path: "/replies/reply-1/draft",
    query: new URLSearchParams(),
    body: { body: "Thanks for the note." },
  });
  assert.equal(draft.status, 201);
  assert.equal(memory.calls.includes("replies.saveDraft"), true);
  assert.equal(memory.drafts[0]?.body, "Thanks for the note.");

  const mailboxes = await handleApiV1(memory.services, {
    method: "GET",
    path: "/mailboxes",
    query: new URLSearchParams(),
    body: undefined,
  });
  assert.equal(JSON.stringify(mailboxes.body).includes("password"), false);
});

test("openapi lists every route and the dispatch requires a bearer key", async () => {
  const document = openApiDocument() as { paths: Record<string, Record<string, { operationId: string }>> };
  for (const route of API_ROUTES) {
    assert.equal(document.paths[route.path]?.[route.method.toLowerCase()]?.operationId, route.operationId);
  }
  const memory = createMemoryServices();
  const deps = dispatchDeps(memory.services);
  const missing = await dispatch(deps, { method: "GET", url: "/api/v1/mailboxes", headers: {}, body: undefined });
  assert.equal(missing?.status, 401);
  const ok = await dispatch(deps, {
    method: "GET",
    url: "/api/v1/openapi.json",
    headers: { Authorization: "Bearer app-key" },
    body: undefined,
  });
  assert.equal(ok?.status, 200);
  assert.equal((ok?.body as { openapi: string }).openapi, "3.1.0");

  const mcpMissing = await dispatch(deps, {
    method: "POST",
    url: "/mcp",
    headers: {},
    body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  assert.equal(mcpMissing?.status, 401);
});

function mentionsSend(calls: readonly string[]): boolean {
  return calls.some((call) => call.toLowerCase().includes("send"));
}

function dispatchDeps(services: ReturnType<typeof createMemoryServices>["services"]) {
  const warmy: Omit<WarmyHttpDeps, "services"> = {
    keys: { getKey: async () => null, setKey: async () => {} },
    links: { get: async () => null, set: async () => {} },
    getMailbox: async () => null,
  };
  return {
    services,
    authenticateApiKey: async (token: string) => (token === "app-key" ? { userId: "user-1" } : null),
    authenticateSession: async () => ({ userId: "user-1" }),
    warmy,
  };
}
