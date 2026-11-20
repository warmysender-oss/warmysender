import {
  AUTH_FAILURES_BEFORE_PAUSE,
  AUTH_RETRY_DELAY_MS,
  MAX_SEND_ATTEMPTS,
  PAUSE_REASON_AUTH,
  TRANSIENT_BACKOFF_MS,
} from "./constants.js";

export type SendFailure = {
  responseCode?: number | null;
  /** Enhanced status, for example "5.1.1" or "4.7.1". */
  enhancedCode?: string | null;
  message?: string | null;
  timedOut?: boolean;
  authFailed?: boolean;
};

export type FailureClass = "transient" | "recipient_bounce" | "auth_failure" | "permanent";

const AUTH_RESPONSE_CODES = new Set([334, 432, 454, 530, 534, 535, 538]);

/**
 * Spec §3.5: 4xx and timeouts retry; 5xx recipient failures bounce the contact.
 * Authentication failures are not recipient bounces and are not retried in a loop.
 * SMTP 5xx other than the auth codes above are treated as recipient bounces
 * ("5xx → bounced"), including policy codes such as 5.7.1.
 */
export function classifyDeliveryFailure(failure: SendFailure): FailureClass {
  const code = failure.responseCode ?? null;
  const message = (failure.message ?? "").toLowerCase();
  const enhanced = (failure.enhancedCode ?? "").trim();
  const looksLikeAuth =
    failure.authFailed === true ||
    (code !== null && AUTH_RESPONSE_CODES.has(code)) ||
    (/authentication failed|invalid credentials|login failed|bad username|password/.test(
      message,
    ) &&
      (code === null || code >= 400));

  if (looksLikeAuth) return "auth_failure";

  const is4xx =
    enhanced.startsWith("4.") || (code !== null && code >= 400 && code <= 499);
  if (is4xx) return "transient";
  if (failure.timedOut && (code === null || code < 500)) return "transient";

  const is5xx =
    enhanced.startsWith("5.") || (code !== null && code >= 500 && code <= 599);
  if (is5xx) return "recipient_bounce";

  if (failure.timedOut) return "transient";
  if (/timeout|timed out|econnreset|econnrefused|etimedout|socket hang up|eai_again/.test(message)) {
    return "transient";
  }
  return "permanent";
}

export type FailureDecision =
  | {
      kind: "retry";
      reason: "transient" | "auth_failure";
      delayMs: number;
      /** Transient attempt counter to store. Auth failures do not increase it. */
      attempts: number;
      consecutiveAuthFailures: number;
    }
  | {
      kind: "fail";
      reason: string;
      attempts: number;
      consecutiveAuthFailures: number;
    }
  | {
      kind: "bounce";
      attempts: number;
      consecutiveAuthFailures: number;
    }
  | {
      kind: "pause_mailbox";
      reason: string;
      attempts: number;
      consecutiveAuthFailures: number;
    };

export function decideAfterFailure(input: {
  /** Transient attempts already used before this try. */
  attemptsSoFar: number;
  consecutiveAuthFailures: number;
  failure: SendFailure;
}): FailureDecision {
  const klass = classifyDeliveryFailure(input.failure);
  if (klass === "recipient_bounce") {
    return {
      kind: "bounce",
      attempts: input.attemptsSoFar + 1,
      consecutiveAuthFailures: 0,
    };
  }
  if (klass === "auth_failure") {
    const consecutiveAuthFailures = input.consecutiveAuthFailures + 1;
    if (consecutiveAuthFailures >= AUTH_FAILURES_BEFORE_PAUSE) {
      return {
        kind: "pause_mailbox",
        reason: PAUSE_REASON_AUTH,
        attempts: input.attemptsSoFar,
        consecutiveAuthFailures,
      };
    }
    return {
      kind: "retry",
      reason: "auth_failure",
      delayMs: AUTH_RETRY_DELAY_MS,
      attempts: input.attemptsSoFar,
      consecutiveAuthFailures,
    };
  }
  if (klass === "permanent") {
    return {
      kind: "fail",
      reason: failureReason("permanent", input.failure),
      attempts: input.attemptsSoFar + 1,
      consecutiveAuthFailures: 0,
    };
  }
  const attempt = input.attemptsSoFar + 1;
  if (attempt >= MAX_SEND_ATTEMPTS) {
    return {
      kind: "fail",
      reason: failureReason("transient_exhausted", input.failure),
      attempts: attempt,
      consecutiveAuthFailures: 0,
    };
  }
  const delayMs = TRANSIENT_BACKOFF_MS[Math.min(attempt - 1, TRANSIENT_BACKOFF_MS.length - 1)]!;
  return {
    kind: "retry",
    reason: "transient",
    delayMs,
    attempts: attempt,
    consecutiveAuthFailures: 0,
  };
}

export function failureReason(code: string, failure: SendFailure): string {
  const bits = [code];
  if (failure.responseCode) bits.push(`smtp=${failure.responseCode}`);
  if (failure.enhancedCode) bits.push(`status=${failure.enhancedCode}`);
  if (failure.message) bits.push(failure.message.replace(/[\r\n]+/g, " ").slice(0, 240));
  return bits.join(" ");
}

export function retryAt(now: Date, delayMs: number): Date {
  return new Date(now.getTime() + delayMs);
}
