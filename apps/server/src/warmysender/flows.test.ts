import assert from "node:assert/strict";
import test from "node:test";
import { createWarmySenderClient, type FetchLike } from "./client.js";
import { nextContactStatus, verifyAddresses } from "./verification.js";
import { warmUpMailbox, type WarmupMailboxInput } from "./warmup.js";
import { connectWarmySender, type WarmySenderKeyStore } from "./settings.js";
import { handleWarmySenderHttp } from "./http.js";
import { createMemoryServices } from "../api/memory.js";

const allowance = {
  can_verify_now: true,
  access_source: "credits",
  monthly_allowance: 0,
  monthly_used: 0,
  monthly_remaining: 0,
  daily_allowance: 0,
  daily_used: 0,
  daily_remaining: 0,
  daily_pace_note: "Credits.",
  credit_balance: 20,
  addon_monthly_allowance: 0,
  addon_remaining: 0,
  free_checks_remaining_today: 0,
  can_buy_credits: true,
  verifiable_now: 20,
  max_addresses_per_batch: 5000,
};

const stats = {
  mailbox_id: "mb-1",
  email_address: "ava@harbor-dental.test",
  warmup_enabled: true,
  warmup_type: "normal",
  warmup_progress: 0,
  sent_today: 0,
  inbox_rate: 0,
  spam_rate: 0,
  reputation_score: 0,
  health_status: "ok",
  incoming_warmup_state: "receiving",
  incoming_warmup_state_detail: "Warmup is arriving at this mailbox normally.",
};

test("verification maps valid, invalid, and risky and leaves other outcomes", () => {
  assert.equal(nextContactStatus("active", "valid"), null);
  assert.equal(nextContactStatus("invalid", "valid"), "active");
  assert.equal(nextContactStatus("active", "invalid"), "invalid");
  assert.equal(nextContactStatus("active", "risky"), "risky");
  assert.equal(nextContactStatus("replied", "invalid"), null);
  assert.equal(nextContactStatus("bounced", "risky"), null);
  assert.equal(nextContactStatus("unsubscribed", "valid"), null);
  assert.equal(nextContactStatus("active", "unknown"), null);
  assert.equal(nextContactStatus("active", "pending"), null);
});

test("verify polls the batch and pages results without calling when verification is closed", async () => {
  const calls: string[] = [];
  let batchGets = 0;
  const fetchImpl: FetchLike = async (url) => {
    calls.push(new URL(url).pathname);
    if (url.endsWith("/verification/allowance")) return json(200, { data: allowance });
    if (url.endsWith("/verification/batches") && !url.includes("/results")) {
      if (calls.filter((path) => path.endsWith("/verification/batches")).length === 1) {
        return json(202, { data: { id: "batch-1", status: "processing", create_list: false } });
      }
    }
    if (url.includes("/verification/batches/batch-1") && !url.includes("/results")) {
      batchGets += 1;
      return json(200, { data: { id: "batch-1", status: batchGets < 2 ? "processing" : "completed" } });
    }
    if (url.includes("/results")) {
      const offset = new URL(url).searchParams.get("offset");
      if (offset === "0") {
        return json(200, {
          data: [
            { email: "jane@harbor-dental.test", status: "valid", reason: "accepted" },
            { email: "sam@north-pier.test", status: "invalid", reason: "rejected" },
          ],
          pagination: { has_more: true, total: 3, limit: 1000, offset: 0 },
        });
      }
      return json(200, {
        data: [{ email: "riley@lumen-labs.test", status: "risky", reason: "catch-all", is_catch_all: true }],
        pagination: { has_more: false, total: 3, limit: 1000, offset: 2 },
      });
    }
    throw new Error(`unexpected ${url}`);
  };
  const client = createWarmySenderClient({ apiKey: "ws_test_only", fetchImpl });
  const result = await verifyAddresses(client, {
    emails: ["jane@harbor-dental.test", "sam@north-pier.test", "riley@lumen-labs.test"],
    sleep: async () => {},
    maxPolls: 5,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.batch_status, "completed");
    assert.deepEqual(
      result.results.map((item) => item.status),
      ["valid", "invalid", "risky"],
    );
    assert.equal(result.incomplete, false);
  }
  const posted = calls.filter((path) => path.endsWith("/verification/batches"));
  assert.equal(posted.length, 1);

  const closed: FetchLike = async (url) => {
    assert.ok(url.endsWith("/verification/allowance"));
    return json(200, { data: { ...allowance, can_verify_now: false, access_source: "none" } });
  };
  const blocked = await verifyAddresses(createWarmySenderClient({ apiKey: "ws_test_only", fetchImpl: closed }), {
    emails: ["jane@harbor-dental.test"],
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.reason, "cannot_verify_now");
});

test("warmup sends SMTP login only after confirm, and never for Microsoft", async () => {
  const calls: { method: string; path: string; body?: unknown; idempotency?: string }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const path = new URL(url).pathname.replace(/^\/api\/v1/, "");
    calls.push({
      method: init.method,
      path,
      body: init.body ? (JSON.parse(init.body) as unknown) : undefined,
      idempotency: init.headers["Idempotency-Key"],
    });
    if (init.method === "POST" && path === "/mailboxes") {
      return json(201, { data: { id: "mb-1", email_address: "ava@harbor-dental.test", status: "testing" } });
    }
    if (init.method === "GET" && path === "/mailboxes/mb-1") {
      return json(200, { data: { id: "mb-1", email_address: "ava@harbor-dental.test", status: "connected" } });
    }
    if (init.method === "PATCH") return json(200, { data: stats });
    if (path === "/warmup/stats/mb-1") return json(200, { data: stats });
    throw new Error(`unexpected ${init.method} ${path}`);
  };
  const client = createWarmySenderClient({ apiKey: "ws_test_only", fetchImpl });
  const mailbox = smtpMailbox();

  const unconfirmed = await warmUpMailbox(client, mailbox, { confirmed: false });
  assert.equal(unconfirmed.status, "confirmation_required");
  assert.match(unconfirmed.status === "confirmation_required" ? unconfirmed.message : "", /login is sent to WarmySender/);
  assert.equal(calls.length, 0);

  const microsoft = await warmUpMailbox(client, { ...mailbox, kind: "microsoft", smtp: null, imap: null }, { confirmed: true });
  assert.equal(microsoft.status, "microsoft");
  assert.match(microsoft.status === "microsoft" ? microsoft.message : "", /Connect this mailbox in WarmySender/);
  assert.equal(calls.length, 0);

  const warmed = await warmUpMailbox(client, mailbox, { confirmed: true, sleep: async () => {} });
  assert.equal(warmed.status, "warming");
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.path}`),
    ["POST /mailboxes", "GET /mailboxes/mb-1", "PATCH /warmup/settings/mb-1", "GET /warmup/stats/mb-1"],
  );
  assert.equal(calls[0]?.idempotency, "oss-warmup-box-1");
  assert.equal((calls[0]?.body as { smtp_password?: string }).smtp_password, "demo-secret");
  assert.equal(JSON.stringify(warmed).includes("demo-secret"), false);
});

test("a rejected key is not stored, and a saved connection does not echo the key", async () => {
  const store = memoryKeys();
  let fetches = 0;
  const fetchImpl: FetchLike = async () => {
    fetches += 1;
    return json(401, { error: { code: "unauthorized", message: "Missing or invalid API key." } });
  };
  await assert.rejects(() => connectWarmySender(store, "not-a-key", { fetchImpl }));
  assert.equal(fetches, 0);
  await assert.rejects(() => connectWarmySender(store, "ws_test_only", { fetchImpl }));
  assert.equal(await store.getKey(), null);

  const ok: FetchLike = async () => json(200, { data: allowance });
  const connected = await connectWarmySender(store, "ws_test_only", { fetchImpl: ok });
  assert.equal(connected.connected, true);
  assert.equal(JSON.stringify(connected).includes("ws_test_only"), false);
  assert.equal(await store.getKey(), "ws_test_only");
});

test("verify route updates contacts and warmup route refuses to run without confirm", async () => {
  const memory = createMemoryServices();
  const jane = await memory.services.contacts.create({ email: "jane@harbor-dental.test" });
  const sam = await memory.services.contacts.create({ email: "sam@north-pier.test", first_name: "Sam" });
  await memory.services.contacts.updateStatus(sam.id, "replied");
  const list = await memory.services.lists.create("Harbor");
  await memory.services.lists.addContacts(list.id, [jane.id, sam.id]);

  let posts = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    if (init.method === "POST") posts += 1;
    if (url.endsWith("/verification/allowance")) return json(200, { data: allowance });
    if (url.endsWith("/verification/batches")) return json(202, { data: { id: "batch-9", status: "processing" } });
    if (url.includes("/verification/batches/batch-9") && !url.includes("results")) {
      return json(200, { data: { id: "batch-9", status: "completed" } });
    }
    if (url.includes("/results")) {
      return json(200, {
        data: [
          { email: "jane@harbor-dental.test", status: "invalid" },
          { email: "sam@north-pier.test", status: "invalid" },
        ],
        pagination: { has_more: false, total: 2, limit: 1000, offset: 0 },
      });
    }
    throw new Error(url);
  };
  const keys = memoryKeys("ws_test_only");
  const links = new Map<string, string>();
  const result = await handleWarmySenderHttp(
    {
      services: memory.services,
      keys,
      links: { get: async (id) => links.get(id) ?? null, set: async (id, warmy) => void links.set(id, warmy) },
      getMailbox: async () => smtpMailbox(),
      fetchImpl,
    },
    { method: "POST", path: "/api/warmysender/verify", body: { list_id: list.id } },
  );
  assert.equal(result.status, 200);
  const data = (result.body as { data: { updates: { email: string; status: string }[] } }).data;
  assert.deepEqual(data.updates, [{ email: "jane@harbor-dental.test", status: "invalid", verification: "invalid" }]);
  assert.equal(posts, 1);

  const warmup = await handleWarmySenderHttp(
    {
      services: memory.services,
      keys,
      links: { get: async () => null, set: async () => {} },
      getMailbox: async () => smtpMailbox(),
      fetchImpl: async () => {
        throw new Error("network");
      },
    },
    { method: "POST", path: "/api/warmysender/mailboxes/box-1/warmup", body: {} },
  );
  assert.equal(warmup.status, 200);
  assert.equal((warmup.body as { data: { status: string } }).data.status, "confirmation_required");
});

test("a duplicate mailbox is warmed in place, and a failed connection test does not enable warmup", async () => {
  const paths: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const path = new URL(url).pathname;
    paths.push(`${init.method} ${path}`);
    if (init.method === "POST") {
      return json(409, { error: { code: "duplicate_email", message: "An active mailbox already uses this email." } });
    }
    if (path.endsWith("/mailboxes") && init.method === "GET") {
      return json(200, { data: [{ id: "mb-9", email_address: "ava@harbor-dental.test", status: "connected" }] });
    }
    if (path.endsWith("/mailboxes/mb-9")) {
      return json(200, { data: { id: "mb-9", email_address: "ava@harbor-dental.test", status: "error", last_test_error: "Login failed." } });
    }
    if (init.method === "PATCH") throw new Error("warmup was enabled after a failed connection test");
    throw new Error(`unexpected ${init.method} ${path}`);
  };
  const outcome = await warmUpMailbox(createWarmySenderClient({ apiKey: "ws_test_only", fetchImpl }), smtpMailbox(), {
    confirmed: true,
    sleep: async () => {},
  });
  assert.equal(outcome.status, "connection_failed");
  if (outcome.status === "connection_failed") assert.equal(outcome.error, "Login failed.");
  assert.equal(paths.some((path) => path.startsWith("PATCH")), false);
});

function smtpMailbox(): WarmupMailboxInput {
  return {
    id: "box-1",
    fromName: "Ava",
    email: "ava@harbor-dental.test",
    kind: "smtp",
    smtp: { host: "smtp.harbor-dental.test", port: 587, username: "ava@harbor-dental.test", password: "demo-secret" },
    imap: { host: "imap.harbor-dental.test", port: 993, username: "ava@harbor-dental.test", password: "demo-secret" },
  };
}

function memoryKeys(initial: string | null = null): WarmySenderKeyStore {
  let key = initial;
  return { getKey: async () => key, setKey: async (next) => void (key = next) };
}

function json(status: number, body: unknown) {
  return {
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  };
}
