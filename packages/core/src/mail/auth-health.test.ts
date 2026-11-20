import { describe, expect, it } from "vitest"
import { RECONNECT_MESSAGE, applyAuthResult, initialAuthHealth, shouldAttemptLogin } from "./auth-health.js"

describe("auth failure pause", () => {
  it("pauses on the third SMTP failure and leaves the IMAP streak alone", () => {
    let health = initialAuthHealth()
    health = applyAuthResult(health, "smtp", false)
    health = applyAuthResult(health, "smtp", false)
    expect(health.paused).toBe(false)
    expect(health.smtpAuthFailureStreak).toBe(2)
    health = applyAuthResult(health, "imap", false)
    expect(health.paused).toBe(false)
    health = applyAuthResult(health, "smtp", false)
    expect(health.paused).toBe(true)
    expect(health.pauseReason).toBe(RECONNECT_MESSAGE)
    expect(health.imapAuthFailureStreak).toBe(1)
    expect(shouldAttemptLogin(health)).toBe(false)
  })

  it("does not change a paused mailbox and resets only the channel that succeeded", () => {
    let health = initialAuthHealth()
    health = applyAuthResult(health, "smtp", false)
    health = applyAuthResult(health, "imap", false)
    health = applyAuthResult(health, "smtp", true)
    expect(health.smtpAuthFailureStreak).toBe(0)
    expect(health.imapAuthFailureStreak).toBe(1)

    let paused = initialAuthHealth()
    paused = applyAuthResult(paused, "imap", false)
    paused = applyAuthResult(paused, "imap", false)
    paused = applyAuthResult(paused, "imap", false)
    const again = applyAuthResult(paused, "imap", false)
    expect(again).toEqual(paused)
  })
})
