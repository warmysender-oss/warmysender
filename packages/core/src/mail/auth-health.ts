export const AUTH_FAILURES_BEFORE_PAUSE = 3

export const RECONNECT_MESSAGE =
  "Mailbox paused after 3 authentication failures in a row. Reconnect the mailbox before sending again."

export type AuthChannel = "smtp" | "imap"

export type AuthHealth = {
  paused: boolean
  pauseReason: string | null
  smtpAuthFailureStreak: number
  imapAuthFailureStreak: number
}

export function initialAuthHealth(): AuthHealth {
  return {
    paused: false,
    pauseReason: null,
    smtpAuthFailureStreak: 0,
    imapAuthFailureStreak: 0,
  }
}

/** Paused mailboxes stay paused. Callers must not retry a failing login in a loop. */
export function shouldAttemptLogin(health: AuthHealth): boolean {
  return !health.paused
}

export function applyAuthResult(health: AuthHealth, channel: AuthChannel, ok: boolean): AuthHealth {
  if (health.paused) return health
  const key = streakKey(channel)
  if (ok) {
    return { ...health, [key]: 0 }
  }
  const next = health[key] + 1
  if (next >= AUTH_FAILURES_BEFORE_PAUSE) {
    return {
      ...health,
      [key]: next,
      paused: true,
      pauseReason: RECONNECT_MESSAGE,
    }
  }
  return { ...health, [key]: next }
}

export function clearAuthPause(): AuthHealth {
  return initialAuthHealth()
}

function streakKey(channel: AuthChannel): "smtpAuthFailureStreak" | "imapAuthFailureStreak" {
  return channel === "smtp" ? "smtpAuthFailureStreak" : "imapAuthFailureStreak"
}
