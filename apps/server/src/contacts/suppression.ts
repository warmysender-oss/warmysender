import { isValidDomain, normalizeEmail } from "./email.js";
import type { ContactStatus, SuppressionKind, SuppressionRecord } from "./types.js";

export type SuppressionEntry = {
  kind: SuppressionKind;
  value: string;
  reason?: string;
};

export function normalizeSuppression(
  kind: SuppressionKind,
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (kind === "email") {
    const email = normalizeEmail(raw);
    if (!email) return { ok: false, error: "Enter a valid email address to suppress." };
    return { ok: true, value: email };
  }
  if (kind !== "domain") return { ok: false, error: "Suppression must be an email or a domain." };
  const domain = raw.trim().toLowerCase().replace(/^@+/, "").replace(/\.+$/, "");
  if (domain.includes("@")) {
    return { ok: false, error: "Enter a domain like harbor-dental.test, without the @." };
  }
  if (!isValidDomain(domain)) {
    return { ok: false, error: "Enter a domain like harbor-dental.test, without the @." };
  }
  return { ok: true, value: domain };
}

export function isSuppressed(email: string, entries: SuppressionEntry[]): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  return entries.some((entry) => {
    if (entry.kind === "email") return entry.value === normalized;
    return entry.kind === "domain" && entry.value === domain;
  });
}

/** Bounced and unsubscribed contacts are added to the global email suppression list. */
export function suppressionForStatus(status: ContactStatus, email: string): SuppressionEntry | null {
  if (status !== "bounced" && status !== "unsubscribed") return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return { kind: "email", value: normalized, reason: status };
}

export function sameSuppression(
  left: Pick<SuppressionRecord, "kind" | "value">,
  right: SuppressionEntry,
): boolean {
  return left.kind === right.kind && left.value === right.value;
}
