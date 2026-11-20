import { ApiError } from "./errors.js";

/**
 * Object keys an agent must not set. Matched case-insensitively, on every
 * nested object, so a limit cannot ride along on another request.
 */
const LIMIT_FIELDS = new Set([
  "daily_cap",
  "dailycap",
  "daily_send_limit",
  "dailysendlimit",
  "cap_today",
  "captoday",
  "min_gap",
  "max_gap",
  "mingap",
  "maxgap",
  "min_gap_minutes",
  "max_gap_minutes",
  "mingapminutes",
  "maxgapminutes",
  "sending_window",
  "sendingwindow",
  "window_start",
  "window_end",
  "ramp",
  "ramp_cap",
  "rampcap",
]);

const LIMIT_MESSAGE =
  "An agent can never raise a limit. Daily cap, ramp, sending window, and the gap between sends are fixed in code.";

export function rejectLimitFields(value: unknown): void {
  walk(value);
}

function walk(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/-/g, "_");
    if (LIMIT_FIELDS.has(normalized) || LIMIT_FIELDS.has(normalized.replace(/_/g, ""))) {
      throw new ApiError(403, "limit_locked", LIMIT_MESSAGE);
    }
    walk(child);
  }
}

export const SAFETY_SENTENCE =
  "Tools never send directly and can never raise a limit; the scheduler sends inside safe limits.";
