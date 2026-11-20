/**
 * Safety limits from build spec §1 and §3.2. The scheduler enforces these
 * even when a stored mailbox value is higher. An agent cannot raise them.
 *
 * Spec §3.5 requires backoff for transient SMTP failures but does not set the
 * delays. TRANSIENT_BACKOFF_MS and AUTH_RETRY_DELAY_MS are the v1 schedule.
 */

/** Per-mailbox default from spec §1 / §3.2. */
export const DEFAULT_DAILY_CAP = 30;

/** Hard maximum. effectiveDailyCap never returns more than this. */
export const HARD_MAX_DAILY_CAP = 50;

/** Days 1–7 of a new mailbox. */
export const RAMP_CAP_DAYS_1_TO_7 = 10;

/** Days 8–14 of a new mailbox. */
export const RAMP_CAP_DAYS_8_TO_14 = 20;

/** Last ramp day that uses the first-week cap (inclusive). */
export const RAMP_FIRST_WEEK_LAST_DAY = 7;

/** Last ramp day that uses the second-week cap (inclusive). */
export const RAMP_SECOND_WEEK_LAST_DAY = 14;

/** Default random gap when a mailbox has not stored one (spec §3.2). */
export const DEFAULT_MIN_GAP_MINUTES = 4;

export const DEFAULT_MAX_GAP_MINUTES = 9;

/**
 * Total SMTP tries for a transient failure (the first try plus retries).
 * Spec §3.5: "retry with backoff (max 3, then mark failed with reason)".
 */
export const MAX_SEND_ATTEMPTS = 3;

/**
 * Delay before the next try after transient attempt 1, then after attempt 2.
 * Attempt 3 does not retry.
 */
export const TRANSIENT_BACKOFF_MS = [5 * 60 * 1000, 15 * 60 * 1000] as const;

/**
 * Spec §3.2: auth failure on send 3 times in a row pauses the mailbox.
 * The mailbox module owns the count and the Reconnect text so SMTP test
 * failures and send failures pause for the same reason.
 */
export { AUTH_FAILURES_BEFORE_PAUSE, RECONNECT_MESSAGE as PAUSE_REASON_AUTH } from "../mail/auth-health.js";

/**
 * Wait after an auth failure so a bad password is not retried every minute.
 * Spec §3.2: never retry a failing login in a tight loop.
 */
export const AUTH_RETRY_DELAY_MS = 30 * 60 * 1000;

export const LIST_UNSUBSCRIBE_POST = "List-Unsubscribe=One-Click";
