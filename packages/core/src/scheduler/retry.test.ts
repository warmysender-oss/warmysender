import { describe, expect, it } from "vitest";
import { AUTH_RETRY_DELAY_MS, PAUSE_REASON_AUTH, TRANSIENT_BACKOFF_MS } from "./constants.js";
import { classifyDeliveryFailure, decideAfterFailure } from "./retry.js";

describe("retries, backoff, and 5xx bounces", () => {
  it("classifies 4xx and timeouts as transient and 5xx as a recipient bounce", () => {
    expect(classifyDeliveryFailure({ responseCode: 450 })).toBe("transient");
    expect(classifyDeliveryFailure({ enhancedCode: "4.7.1" })).toBe("transient");
    expect(classifyDeliveryFailure({ timedOut: true })).toBe("transient");
    expect(classifyDeliveryFailure({ message: "ETIMEDOUT" })).toBe("transient");
    expect(classifyDeliveryFailure({ responseCode: 550, enhancedCode: "5.1.1" })).toBe("recipient_bounce");
    expect(classifyDeliveryFailure({ responseCode: 550, enhancedCode: "5.1.10" })).toBe("recipient_bounce");
    expect(classifyDeliveryFailure({ responseCode: 550, enhancedCode: "5.2.1" })).toBe("recipient_bounce");
    expect(classifyDeliveryFailure({ responseCode: 550, enhancedCode: "5.5.0" })).toBe("recipient_bounce");
    expect(classifyDeliveryFailure({ responseCode: 552, enhancedCode: "5.2.2" })).toBe("policy_block");
    expect(classifyDeliveryFailure({ responseCode: 554, enhancedCode: "5.7.1" })).toBe("policy_block");
    expect(classifyDeliveryFailure({ responseCode: 550 })).toBe("policy_block");
    expect(classifyDeliveryFailure({ responseCode: 535, message: "Authentication failed" })).toBe("auth_failure");
    expect(classifyDeliveryFailure({ authFailed: true, responseCode: 550 })).toBe("auth_failure");
    expect(classifyDeliveryFailure({ message: "invalid envelope" })).toBe("permanent");
  });

  it("backs off twice and then fails the third transient attempt", () => {
    const first = decideAfterFailure({ attemptsSoFar: 0, consecutiveAuthFailures: 0, failure: { responseCode: 451 } });
    const second = decideAfterFailure({ attemptsSoFar: 1, consecutiveAuthFailures: 0, failure: { timedOut: true } });
    const third = decideAfterFailure({ attemptsSoFar: 2, consecutiveAuthFailures: 0, failure: { responseCode: 421 } });
    expect(first).toMatchObject({ kind: "retry", reason: "transient", delayMs: TRANSIENT_BACKOFF_MS[0], attempts: 1 });
    expect(second).toMatchObject({ kind: "retry", reason: "transient", delayMs: TRANSIENT_BACKOFF_MS[1], attempts: 2 });
    expect(second).toMatchObject({ delayMs: expect.any(Number) });
    if (first.kind === "retry" && second.kind === "retry") {
      expect(second.delayMs).toBeGreaterThan(first.delayMs);
    }
    expect(third.kind).toBe("fail");
    if (third.kind === "fail") expect(third.reason.startsWith("transient_exhausted")).toBe(true);
  });

  it("bounces on 5xx without a retry", () => {
    const decision = decideAfterFailure({
      attemptsSoFar: 0,
      consecutiveAuthFailures: 2,
      failure: { responseCode: 550, enhancedCode: "5.1.1", message: "user unknown" },
    });
    expect(decision.kind).toBe("bounce");
    expect(decision.consecutiveAuthFailures).toBe(0);
  });

  it("fails a 5.7 policy block without bouncing, and counts it on the mailbox", () => {
    const decision = decideAfterFailure({
      attemptsSoFar: 0,
      consecutiveAuthFailures: 1,
      consecutivePolicyFailures: 2,
      failure: { responseCode: 554, enhancedCode: "5.7.1", message: "blocked" },
    });
    expect(decision.kind).toBe("policy_block");
    if (decision.kind === "policy_block") {
      expect(decision.reason).toContain("policy_block");
      expect(decision.reason).toContain("5.7.1");
      expect(decision.consecutivePolicyFailures).toBe(3);
      expect(decision.consecutiveAuthFailures).toBe(1);
    }
  });

  it("pauses the mailbox on the third auth failure and does not retry the first two in a tight loop", () => {
    const first = decideAfterFailure({
      attemptsSoFar: 0,
      consecutiveAuthFailures: 0,
      failure: { responseCode: 535, message: "Authentication failed" },
    });
    const second = decideAfterFailure({
      attemptsSoFar: 0,
      consecutiveAuthFailures: 1,
      failure: { authFailed: true },
    });
    const third = decideAfterFailure({
      attemptsSoFar: 0,
      consecutiveAuthFailures: 2,
      failure: { responseCode: 535 },
    });
    expect(first).toMatchObject({
      kind: "retry",
      reason: "auth_failure",
      delayMs: AUTH_RETRY_DELAY_MS,
      attempts: 0,
      consecutiveAuthFailures: 1,
    });
    expect(second).toMatchObject({ kind: "retry", consecutiveAuthFailures: 2, attempts: 0 });
    if (first.kind === "retry") expect(first.delayMs).toBeGreaterThanOrEqual(30 * 60_000);
    expect(third).toMatchObject({
      kind: "pause_mailbox",
      reason: PAUSE_REASON_AUTH,
      consecutiveAuthFailures: 3,
      attempts: 0,
    });
  });
});
