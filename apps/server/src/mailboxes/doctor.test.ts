import { describe, expect, it } from "vitest"
import { runDoctor } from "./doctor.js"
import type { DeliverabilityReport } from "@warmysender/core"

describe("doctor", () => {
  it("prints a fix for each failed check and passes when nothing is wrong", async () => {
    const failed = await runDoctor({
      env: {},
      now: new Date("2026-01-03T15:00:00.000Z"),
      async database() {
        return { ok: false, detail: "connection refused" }
      },
      async workerHeartbeatAt() {
        return null
      },
      async fetchPublicUrl() {
        return { ok: false, detail: "not requested" }
      },
      async mailboxes() {
        return [{
          email: "ada@harbor-dental.test",
          paused: true,
          pauseReason: "Mailbox paused after 3 authentication failures in a row. Reconnect the mailbox before sending again.",
          async test() {
            throw new Error("should not test a paused mailbox")
          },
          async dns() {
            return missingSpf()
          },
        }]
      },
    })
    expect(failed.ok).toBe(false)
    expect(failed.text).toContain("[fail] DATABASE_URL")
    expect(failed.text).toContain("Fix: Set DATABASE_URL")
    expect(failed.text).toContain("[fail] Worker")
    expect(failed.text).toContain("ada@harbor-dental.test DNS")
    expect(failed.text).toContain("no SPF record")
    expect(failed.text).not.toContain("should not test")

    const passed = await runDoctor({
      env: {
        DATABASE_URL: "postgres://app@db/app",
        ENCRYPTION_KEY: "ZGV2LW9ubHktbm90LWZvci1wcm9kdWN0aW9uLXVzZSE=",
        SESSION_SECRET: "dev-only-session-secret-change!!",
        PUBLIC_URL: "https://mail.example.com",
      },
      now: new Date("2026-01-03T15:00:00.000Z"),
      async database() {
        return { ok: true, detail: "Postgres answered." }
      },
      async workerHeartbeatAt() {
        return new Date("2026-01-03T14:59:00.000Z")
      },
      async fetchPublicUrl(url) {
        return { ok: true, detail: `${url} responded with HTTP 200.` }
      },
      async mailboxes() {
        return []
      },
    })
    expect(passed.ok).toBe(true)
    expect(passed.text).toContain("All checks passed.")
    expect(passed.text).toContain("No mailboxes are connected yet.")
  })
})

function missingSpf(): DeliverabilityReport {
  return {
    domain: "harbor-dental.test",
    launchWarning: "harbor-dental.test is missing SPF and DMARC.",
    checks: [
      { id: "spf", status: "fail", code: "missing", summary: "harbor-dental.test has no SPF record.", fix: "Add an SPF TXT record." },
      { id: "dkim", status: "warn", code: "none_found", summary: "No DKIM key found.", fix: "Publish DKIM." },
      { id: "dmarc", status: "fail", code: "missing", summary: "harbor-dental.test has no DMARC record.", fix: "Add a DMARC TXT record." },
      { id: "mx", status: "pass", code: "ok", summary: "MX records: mx.harbor-dental.test.", fix: null },
    ],
  }
}
