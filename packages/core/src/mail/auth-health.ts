export const AUTH_FAILURES_BEFORE_PAUSE = 3

export const RECONNECT_MESSAGE =
  "Mailbox paused after 3 authentication failures in a row. Reconnect the mailbox before sending again."

/** Matches mailboxes.health: unknown, healthy, or paused. */
export type MailboxHealthState = "unknown" | "healthy" | "paused"

export type AuthHealth = {
  health: MailboxHealthState
  pausedReason: string | null
  consecutiveAuthFailures: number
}

export function initialAuthHealth(): AuthHealth {
  return {
    health: "unknown",
    pausedReason: null,
    consecutiveAuthFailures: 0,
  }
}

/** Paused mailboxes stay paused. Callers must not retry a failing login in a loop. */
export function shouldAttemptLogin(health: Pick<AuthHealth, "health">): boolean {
  return health.health !== "paused"
}

/**
 * One counter for SMTP and IMAP. A success clears it. The third failure in a row pauses the mailbox.
 * The database stores this single consecutive_auth_failures column.
 */
export function applyAuthResult(health: AuthHealth, ok: boolean): AuthHealth {
  if (health.health === "paused") return health
  if (ok) {
    return { health: "healthy", pausedReason: null, consecutiveAuthFailures: 0 }
  }
  const next = health.consecutiveAuthFailures + 1
  if (next >= AUTH_FAILURES_BEFORE_PAUSE) {
    return {
      health: "paused",
      pausedReason: RECONNECT_MESSAGE,
      consecutiveAuthFailures: next,
    }
  }
  return { ...health, consecutiveAuthFailures: next }
}

export function clearAuthPause(): AuthHealth {
  return { health: "healthy", pausedReason: null, consecutiveAuthFailures: 0 }
}
