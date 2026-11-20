import { WARMY_SENDER_API_BASE } from "./links.js";

/**
 * Client for the public WarmySender API.
 * Field names match https://warmysender.com/api/v1/openapi.json (fetched for this build).
 * Tests pass a fake fetch. This module does not embed an API key.
 */

export class WarmySenderApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;
  readonly retryAfter: string | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
    retryAfter?: string | null,
  ) {
    super(message);
    this.name = "WarmySenderApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter ?? null;
  }
}

export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    redirect: "error";
    signal: AbortSignal;
  },
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export type VerificationResultStatus =
  | "pending"
  | "processing"
  | "valid"
  | "invalid"
  | "risky"
  | "unknown"
  | "error"
  | "cancelled";

export type VerificationAllowance = {
  can_verify_now: boolean;
  access_source: string;
  monthly_allowance: number;
  monthly_used: number;
  monthly_remaining: number;
  daily_allowance: number;
  daily_used: number;
  daily_remaining: number;
  daily_pace_note: string;
  credit_balance: number;
  addon_monthly_allowance: number;
  addon_remaining: number;
  free_checks_remaining_today: number;
  can_buy_credits: boolean;
  verifiable_now: number;
  max_addresses_per_batch: number;
};

export type VerificationBatchSubmission = {
  id: string;
  status: string;
  continues_tomorrow?: boolean;
  accepted?: number;
  submitted?: number;
  create_list?: boolean;
  skipped_without_email?: number;
};

export type VerificationBatch = {
  id: string;
  status: string;
  name?: string;
  total?: number;
  checked?: number;
  valid?: number;
  invalid?: number;
  risky?: number;
  unknown?: number;
  completed_at?: string | null;
  continues_tomorrow?: boolean;
  wait_reason?: string | null;
};

export type VerificationResult = {
  email: string;
  status: VerificationResultStatus;
  reason?: string;
  is_catch_all?: boolean;
  mx_host?: string | null;
  checked_at?: string | null;
};

export type VerificationResultsPage = {
  results: VerificationResult[];
  has_more: boolean;
  total?: number;
  limit?: number;
  offset?: number;
};

export type CreateMailboxRequest = {
  email_address: string;
  smtp_host: string;
  smtp_port?: number;
  smtp_username: string;
  smtp_password: string;
  imap_host: string;
  imap_port?: number;
  imap_username: string;
  imap_password: string;
  external_id?: string;
  display_name?: string;
};

export type WarmyMailbox = {
  id: string;
  email_address: string;
  status: string;
  last_test_error?: string | null;
  external_id?: string | null;
};

export type WarmupSettingsPatch = {
  warmup_enabled?: boolean;
  warmup_type?:
    | "new_domain"
    | "new_mailbox"
    | "dormant"
    | "maintenance"
    | "recovery"
    | "aggressive"
    | "normal"
    | "conservative";
  warmup_target_daily_volume?: number;
  language?: "en" | "es" | "fr" | "de" | "pt" | "it" | "nl";
};

export type WarmupStats = {
  mailbox_id: string;
  email_address: string;
  warmup_enabled: boolean;
  warmup_type: string;
  warmup_progress: number;
  sent_today: number;
  inbox_rate: number;
  spam_rate: number;
  reputation_score: number;
  health_status: string;
  incoming_warmup_state: string;
  incoming_warmup_state_detail: string;
};

const RESULT_STATUSES: readonly VerificationResultStatus[] = [
  "pending",
  "processing",
  "valid",
  "invalid",
  "risky",
  "unknown",
  "error",
  "cancelled",
];

export function createWarmySenderClient(options: { apiKey: string; fetchImpl?: FetchLike }) {
  const apiKey = options.apiKey;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);

  async function request(
    method: "GET" | "POST" | "PATCH",
    path: string,
    opts?: { query?: Record<string, string | number | undefined>; body?: unknown; idempotencyKey?: string },
  ): Promise<{ status: number; payload: unknown }> {
    const url = new URL(path.replace(/^\//, ""), `${WARMY_SENDER_API_BASE}/`);
    if (opts?.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    };
    if (opts?.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts?.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    const response = await fetchImpl(url.toString(), {
      method,
      headers,
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new WarmySenderApiError(response.status, "invalid_response", "WarmySender returned a body that was not JSON.");
      }
    }
    if (response.status >= 400) {
      throw errorFromPayload(response.status, payload, response.headers.get("retry-after"));
    }
    return { status: response.status, payload };
  }

  return {
    getVerificationAllowance(): Promise<VerificationAllowance> {
      return request("GET", "/verification/allowance").then(({ payload }) => parseAllowance(unwrapData(payload)));
    },

    submitVerificationBatch(
      body: { emails: string[]; name?: string; create_list: false },
      idempotencyKey?: string,
    ): Promise<VerificationBatchSubmission> {
      return request("POST", "/verification/batches", { body, idempotencyKey }).then(({ payload }) =>
        parseSubmission(unwrapData(payload)),
      );
    },

    getVerificationBatch(id: string): Promise<VerificationBatch> {
      return request("GET", `/verification/batches/${encodeURIComponent(id)}`).then(({ payload }) =>
        parseBatch(unwrapData(payload)),
      );
    },

    getVerificationBatchResults(
      id: string,
      query?: { status?: VerificationResultStatus; limit?: number; offset?: number },
    ): Promise<VerificationResultsPage> {
      return request("GET", `/verification/batches/${encodeURIComponent(id)}/results`, { query }).then(({ payload }) =>
        parseResults(payload),
      );
    },

    createMailbox(body: CreateMailboxRequest, idempotencyKey: string): Promise<{ statusCode: number; mailbox: WarmyMailbox }> {
      return request("POST", "/mailboxes", { body, idempotencyKey }).then(({ status, payload }) => ({
        statusCode: status,
        mailbox: parseMailbox(unwrapData(payload)),
      }));
    },

    listMailboxesByEmail(emailAddress: string): Promise<WarmyMailbox[]> {
      return request("GET", "/mailboxes", { query: { email_address: emailAddress, limit: 100 } }).then(({ payload }) => {
        const data = unwrapData(payload);
        if (!Array.isArray(data)) {
          throw new WarmySenderApiError(502, "invalid_response", "Mailbox list was not an array.");
        }
        return data.map((item) => parseMailbox(item));
      });
    },

    getMailbox(id: string): Promise<WarmyMailbox> {
      return request("GET", `/mailboxes/${encodeURIComponent(id)}`).then(({ payload }) => parseMailbox(unwrapData(payload)));
    },

    updateWarmupSettings(mailboxId: string, body: WarmupSettingsPatch): Promise<WarmupStats> {
      return request("PATCH", `/warmup/settings/${encodeURIComponent(mailboxId)}`, { body }).then(({ payload }) =>
        parseWarmupStats(unwrapData(payload)),
      );
    },

    getWarmupStats(mailboxId: string): Promise<WarmupStats> {
      return request("GET", `/warmup/stats/${encodeURIComponent(mailboxId)}`).then(({ payload }) =>
        parseWarmupStats(unwrapData(payload)),
      );
    },
  };
}

export type WarmySenderClient = ReturnType<typeof createWarmySenderClient>;

function unwrapData(payload: unknown): unknown {
  const object = asObject(payload, "WarmySender response");
  if (!("data" in object)) {
    throw new WarmySenderApiError(502, "invalid_response", "WarmySender response had no data field.");
  }
  return object.data;
}

function errorFromPayload(status: number, payload: unknown, retryAfter: string | null): WarmySenderApiError {
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    const error = (payload as { error?: unknown }).error;
    if (error !== null && typeof error === "object" && !Array.isArray(error)) {
      const record = error as { code?: unknown; message?: unknown; details?: unknown };
      const code = typeof record.code === "string" ? record.code : "http_error";
      const message = typeof record.message === "string" ? record.message : `WarmySender returned HTTP ${status}.`;
      const details =
        record.details !== null && typeof record.details === "object" && !Array.isArray(record.details)
          ? (record.details as Record<string, unknown>)
          : undefined;
      return new WarmySenderApiError(status, code, message, details, retryAfter);
    }
  }
  return new WarmySenderApiError(status, "http_error", `WarmySender returned HTTP ${status}.`, undefined, retryAfter);
}

function parseAllowance(value: unknown): VerificationAllowance {
  const object = asObject(value, "Verification allowance");
  return {
    can_verify_now: requiredBoolean(object, "can_verify_now"),
    access_source: requiredString(object, "access_source"),
    monthly_allowance: requiredNumber(object, "monthly_allowance"),
    monthly_used: requiredNumber(object, "monthly_used"),
    monthly_remaining: requiredNumber(object, "monthly_remaining"),
    daily_allowance: requiredNumber(object, "daily_allowance"),
    daily_used: requiredNumber(object, "daily_used"),
    daily_remaining: requiredNumber(object, "daily_remaining"),
    daily_pace_note: requiredString(object, "daily_pace_note"),
    credit_balance: requiredNumber(object, "credit_balance"),
    addon_monthly_allowance: requiredNumber(object, "addon_monthly_allowance"),
    addon_remaining: requiredNumber(object, "addon_remaining"),
    free_checks_remaining_today: requiredNumber(object, "free_checks_remaining_today"),
    can_buy_credits: requiredBoolean(object, "can_buy_credits"),
    verifiable_now: requiredNumber(object, "verifiable_now"),
    max_addresses_per_batch: requiredNumber(object, "max_addresses_per_batch"),
  };
}

function parseSubmission(value: unknown): VerificationBatchSubmission {
  const object = asObject(value, "Verification batch");
  const submission: VerificationBatchSubmission = {
    id: requiredString(object, "id"),
    status: requiredString(object, "status"),
  };
  if (typeof object.continues_tomorrow === "boolean") submission.continues_tomorrow = object.continues_tomorrow;
  if (typeof object.accepted === "number") submission.accepted = object.accepted;
  if (typeof object.submitted === "number") submission.submitted = object.submitted;
  if (typeof object.create_list === "boolean") submission.create_list = object.create_list;
  if (typeof object.skipped_without_email === "number") submission.skipped_without_email = object.skipped_without_email;
  return submission;
}

function parseBatch(value: unknown): VerificationBatch {
  const object = asObject(value, "Verification batch");
  const batch: VerificationBatch = {
    id: requiredString(object, "id"),
    status: requiredString(object, "status"),
  };
  if (typeof object.name === "string") batch.name = object.name;
  for (const key of ["total", "checked", "valid", "invalid", "risky", "unknown"] as const) {
    if (typeof object[key] === "number") batch[key] = object[key];
  }
  if (typeof object.completed_at === "string" || object.completed_at === null) batch.completed_at = object.completed_at;
  if (typeof object.continues_tomorrow === "boolean") batch.continues_tomorrow = object.continues_tomorrow;
  if (typeof object.wait_reason === "string" || object.wait_reason === null) batch.wait_reason = object.wait_reason;
  return batch;
}

function parseResults(payload: unknown): VerificationResultsPage {
  const object = asObject(payload, "Verification results");
  if (!Array.isArray(object.data)) {
    throw new WarmySenderApiError(502, "invalid_response", "Verification results data was not an array.");
  }
  const pagination = asObject(object.pagination ?? {}, "Verification results pagination");
  return {
    results: object.data.map(parseResult),
    has_more: pagination.has_more === true,
    total: typeof pagination.total === "number" ? pagination.total : undefined,
    limit: typeof pagination.limit === "number" ? pagination.limit : undefined,
    offset: typeof pagination.offset === "number" ? pagination.offset : undefined,
  };
}

function parseResult(value: unknown): VerificationResult {
  const object = asObject(value, "Verification result");
  const status = requiredString(object, "status");
  if (!RESULT_STATUSES.includes(status as VerificationResultStatus)) {
    throw new WarmySenderApiError(502, "invalid_response", `Unexpected verification status "${status}".`);
  }
  const result: VerificationResult = {
    email: requiredString(object, "email"),
    status: status as VerificationResultStatus,
  };
  if (typeof object.reason === "string") result.reason = object.reason;
  if (typeof object.is_catch_all === "boolean") result.is_catch_all = object.is_catch_all;
  if (typeof object.mx_host === "string" || object.mx_host === null) result.mx_host = object.mx_host;
  if (typeof object.checked_at === "string" || object.checked_at === null) result.checked_at = object.checked_at;
  return result;
}

function parseMailbox(value: unknown): WarmyMailbox {
  const object = asObject(value, "Mailbox");
  const mailbox: WarmyMailbox = {
    id: requiredString(object, "id"),
    email_address: requiredString(object, "email_address"),
    status: requiredString(object, "status"),
  };
  if (typeof object.last_test_error === "string" || object.last_test_error === null) {
    mailbox.last_test_error = object.last_test_error;
  }
  if (typeof object.external_id === "string" || object.external_id === null) mailbox.external_id = object.external_id;
  return mailbox;
}

function parseWarmupStats(value: unknown): WarmupStats {
  const object = asObject(value, "Warmup stats");
  return {
    mailbox_id: requiredString(object, "mailbox_id"),
    email_address: requiredString(object, "email_address"),
    warmup_enabled: requiredBoolean(object, "warmup_enabled"),
    warmup_type: requiredString(object, "warmup_type"),
    warmup_progress: requiredNumber(object, "warmup_progress"),
    sent_today: requiredNumber(object, "sent_today"),
    inbox_rate: requiredNumber(object, "inbox_rate"),
    spam_rate: requiredNumber(object, "spam_rate"),
    reputation_score: requiredNumber(object, "reputation_score"),
    health_status: requiredString(object, "health_status"),
    incoming_warmup_state: requiredString(object, "incoming_warmup_state"),
    incoming_warmup_state_detail: requiredString(object, "incoming_warmup_state_detail"),
  };
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new WarmySenderApiError(502, "invalid_response", `${label} was not a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(object: Record<string, unknown>, key: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new WarmySenderApiError(502, "invalid_response", `WarmySender response is missing ${key}.`);
  }
  return value;
}

function requiredBoolean(object: Record<string, unknown>, key: string): boolean {
  const value = object[key];
  if (typeof value !== "boolean") {
    throw new WarmySenderApiError(502, "invalid_response", `WarmySender response is missing ${key}.`);
  }
  return value;
}

function requiredNumber(object: Record<string, unknown>, key: string): number {
  const value = object[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new WarmySenderApiError(502, "invalid_response", `WarmySender response is missing ${key}.`);
  }
  return value;
}
