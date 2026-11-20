import type { ContactStatus } from "../api/services.js";
import {
  WarmySenderApiError,
  type VerificationResult,
  type VerificationResultStatus,
  type WarmySenderClient,
} from "./client.js";

/**
 * §3.3 contact statuses are active, replied, bounced, unsubscribed, invalid, risky.
 * The verification API returns valid / invalid / risky (plus pending states).
 * `valid` has no contact status of its own: a confirmed address stays active,
 * and a contact that was invalid or risky becomes active again.
 * Bounced, unsubscribed, and replied are left alone — the public API's list
 * verification does the same for bounced and unsubscribed.
 */
export function nextContactStatus(
  current: ContactStatus,
  verification: VerificationResultStatus,
): ContactStatus | null {
  const protectedStatus = current === "replied" || current === "bounced" || current === "unsubscribed";
  if (verification === "invalid") {
    if (protectedStatus || current === "invalid") return null;
    return "invalid";
  }
  if (verification === "risky") {
    if (protectedStatus || current === "risky") return null;
    return "risky";
  }
  if (verification === "valid") {
    if (current === "invalid" || current === "risky") return "active";
    return null;
  }
  return null;
}

export type VerifyAddressesResult =
  | { ok: false; reason: "cannot_verify_now"; can_verify_now: false; verifiable_now: number; access_source: string }
  | { ok: false; reason: "too_many_addresses"; count: number; max_addresses_per_batch: number }
  | {
      ok: true;
      batch_id: string;
      batch_status: string;
      incomplete: boolean;
      results: VerificationResult[];
    };

export async function verifyAddresses(
  client: WarmySenderClient,
  input: {
    emails: string[];
    name?: string;
    idempotencyKey?: string;
    maxPolls?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<VerifyAddressesResult> {
  const allowance = await client.getVerificationAllowance();
  if (!allowance.can_verify_now) {
    return {
      ok: false,
      reason: "cannot_verify_now",
      can_verify_now: false,
      verifiable_now: allowance.verifiable_now,
      access_source: allowance.access_source,
    };
  }
  if (input.emails.length > allowance.max_addresses_per_batch) {
    return {
      ok: false,
      reason: "too_many_addresses",
      count: input.emails.length,
      max_addresses_per_batch: allowance.max_addresses_per_batch,
    };
  }

  const submitted = await client.submitVerificationBatch(
    { emails: input.emails, name: input.name, create_list: false },
    input.idempotencyKey,
  );

  const maxPolls = input.maxPolls ?? 30;
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let batch = await client.getVerificationBatch(submitted.id);
  let polls = 0;
  while (!isTerminalBatch(batch.status) && polls < maxPolls) {
    await sleep(2_000);
    batch = await client.getVerificationBatch(submitted.id);
    polls += 1;
  }

  const results = await readAllResults(client, submitted.id);
  const incomplete = !isTerminalBatch(batch.status) || results.some((result) => isUnfinished(result.status));
  return {
    ok: true,
    batch_id: submitted.id,
    batch_status: batch.status,
    incomplete,
    results,
  };
}

function isTerminalBatch(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

function isUnfinished(status: VerificationResultStatus): boolean {
  return status === "pending" || status === "processing";
}

async function readAllResults(client: WarmySenderClient, batchId: string): Promise<VerificationResult[]> {
  const collected: VerificationResult[] = [];
  let offset = 0;
  const limit = 1000;
  let more = true;
  while (more) {
    const page = await client.getVerificationBatchResults(batchId, { limit, offset });
    collected.push(...page.results);
    if (!page.has_more || page.results.length === 0) {
      more = false;
    } else {
      offset += page.results.length;
    }
  }
  return collected;
}

export function admissibleToday(error: unknown): number | null {
  if (!(error instanceof WarmySenderApiError)) return null;
  if (error.code !== "exceeds_today") return null;
  const value = error.details?.admissible_today;
  return typeof value === "number" ? value : null;
}
