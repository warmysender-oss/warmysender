import { describe, expect, it } from "vitest"
import { RECONNECT_MESSAGE, applyAuthResult, initialAuthHealth, shouldAttemptLogin } from "./auth-health.js"

describe("auth failure pause", () => {
  it("pauses on the third failure in a row, whether the failure is SMTP or IMAP", () => {
    let health = initialAuthHealth()
    health = applyAuthResult(health, false)
    health = applyAuthResult(health, false)
    expect(health.health).toBe("unknown")
    expect(health.consecutiveAuthFailures).toBe(2)
    health = applyAuthResult(health, false)
    expect(health.health).toBe("paused")
    expect(health.pausedReason).toBe(RECONNECT_MESSAGE)
    expect(shouldAttemptLogin(health)).toBe(false)
  })

  it("does not change a paused mailbox, and a success clears the streak", () => {
    let health = applyAuthResult(initialAuthHealth(), false)
    health = applyAuthResult(health, true)
    expect(health).toEqual({ health: "healthy", pausedReason: null, consecutiveAuthFailures: 0 })

    let paused = initialAuthHealth()
    paused = applyAuthResult(paused, false)
    paused = applyAuthResult(paused, false)
    paused = applyAuthResult(paused, false)
    expect(applyAuthResult(paused, false)).toEqual(paused)
  })
})
