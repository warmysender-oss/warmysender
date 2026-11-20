import { describe, expect, it } from "vitest";
import { SEND_CLAIM_MS, inFlightDisposition } from "./pending.js";

const NOW = new Date("2026-01-15T12:00:00.000Z");

describe("in-flight sends", () => {
  it("leaves a fresh pending row alone and refuses to resend an old one", () => {
    const fresh = new Date(NOW.getTime() - 60_000);
    const stale = new Date(NOW.getTime() - SEND_CLAIM_MS - 1);
    expect(
      inFlightDisposition({ status: "pending", sendStartedAt: fresh, nextAttemptAt: null, now: NOW }),
    ).toBe("in_flight");
    expect(
      inFlightDisposition({ status: "pending", sendStartedAt: stale, nextAttemptAt: null, now: NOW }),
    ).toBe("uncertain");
  });

  it("does not treat a scheduled retry as an unknown SMTP call", () => {
    const started = new Date(NOW.getTime() - 60 * 60_000);
    expect(
      inFlightDisposition({
        status: "pending",
        sendStartedAt: started,
        nextAttemptAt: new Date(NOW.getTime() + 60_000),
        now: NOW,
      }),
    ).toBe("none");
  });
});
