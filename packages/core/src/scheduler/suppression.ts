import type { SuppressionEntry } from "./types.js";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string | null {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

/**
 * Exact email match, or a domain match on the address domain and its subdomains.
 * Comparison is case-insensitive.
 */
export function isSuppressed(email: string, list: readonly SuppressionEntry[]): boolean {
  const normalized = normalizeEmail(email);
  const domain = emailDomain(email);
  for (const entry of list) {
    const value = entry.value.trim().toLowerCase();
    if (!value) continue;
    if (entry.kind === "email" && value === normalized) return true;
    if (
      entry.kind === "domain" &&
      domain &&
      (domain === value || domain.endsWith(`.${value}`))
    ) {
      return true;
    }
  }
  return false;
}

/** One @, a dot in the domain, no whitespace. Enough to refuse garbage before SMTP. */
export function isDeliverableAddress(email: string): boolean {
  if (email !== email.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
