import assert from "node:assert/strict";
import test from "node:test";
import { WarmySenderApiError, createWarmySenderClient, type FetchLike } from "./client.js";
import { WARMY_SENDER_API_BASE } from "./links.js";

const allowance = {
  can_verify_now: true,
  access_source: "plan",
  monthly_allowance: 10000,
  monthly_used: 1,
  monthly_remaining: 9999,
  daily_allowance: 333,
  daily_used: 1,
  daily_remaining: 332,
  daily_pace_note: "Released daily.",
  credit_balance: 0,
  addon_monthly_allowance: 0,
  addon_remaining: 0,
  free_checks_remaining_today: 0,
  can_buy_credits: true,
  verifiable_now: 332,
  max_addresses_per_batch: 5000,
};

test("allowance request uses the public base URL and the bearer key", async () => {
  const seen: { url: string; authorization: string; body: string | undefined }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    seen.push({ url, authorization: init.headers.Authorization, body: init.body });
    return jsonResponse(200, { data: allowance, meta: { request_id: "req_test" } });
  };
  const client = createWarmySenderClient({ apiKey: "ws_test_only", fetchImpl });
  const result = await client.getVerificationAllowance();
  assert.equal(result.can_verify_now, true);
  assert.equal(result.max_addresses_per_batch, 5000);
  assert.equal(seen[0]?.url, `${WARMY_SENDER_API_BASE}/verification/allowance`);
  assert.equal(seen[0]?.authorization, "Bearer ws_test_only");
  assert.equal(seen[0]?.body, undefined);
});

test("mailbox create sends the documented fields and an idempotency key", async () => {
  let initSeen: { headers: Record<string, string>; body: string | undefined } | undefined;
  const fetchImpl: FetchLike = async (_url, init) => {
    initSeen = { headers: init.headers, body: init.body };
    return jsonResponse(201, {
      data: { id: "mb-1", email_address: "ava@harbor-dental.test", status: "testing" },
    });
  };
  const client = createWarmySenderClient({ apiKey: "ws_test_only", fetchImpl });
  const created = await client.createMailbox(
    {
      email_address: "ava@harbor-dental.test",
      smtp_host: "smtp.harbor-dental.test",
      smtp_port: 587,
      smtp_username: "ava@harbor-dental.test",
      smtp_password: "demo-secret",
      imap_host: "imap.harbor-dental.test",
      imap_port: 993,
      imap_username: "ava@harbor-dental.test",
      imap_password: "demo-secret",
      external_id: "local-1",
    },
    "oss-warmup-local-1",
  );
  assert.equal(created.statusCode, 201);
  assert.equal(initSeen?.headers["Idempotency-Key"], "oss-warmup-local-1");
  const body = JSON.parse(initSeen?.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.smtp_password, "demo-secret");
  assert.equal(body.daily_send_limit, undefined);
  assert.equal(body.auto_enable_warmup, undefined);
});

test("errors use the documented envelope and do not invent a code", async () => {
  const fetchImpl: FetchLike = async () =>
    jsonResponse(429, { error: { code: "exceeds_today", message: "Too big for today.", details: { admissible_today: 10 } } }, {
      "retry-after": "60",
    });
  const client = createWarmySenderClient({ apiKey: "ws_test_only", fetchImpl });
  await assert.rejects(
    () => client.getVerificationAllowance(),
    (error: unknown) => {
      assert.ok(error instanceof WarmySenderApiError);
      assert.equal(error.code, "exceeds_today");
      assert.equal(error.details?.admissible_today, 10);
      assert.equal(error.retryAfter, "60");
      return true;
    },
  );
});

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
  };
}
