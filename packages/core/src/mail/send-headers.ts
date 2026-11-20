import { LIST_UNSUBSCRIBE_POST } from "../scheduler/constants.js";

/**
 * HTTPS or HTTP (local `PUBLIC_URL`) unsubscribe URL.
 * Mailto is rejected. The header value is a single https/http URI in angle brackets.
 */
export function unsubscribeUrl(publicUrl: string, token: string): string | null {
  const base = publicUrl.trim().replace(/\/+$/, "");
  const trimmedToken = token.trim();
  if (!base || !trimmedToken) return null;
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.username || parsed.password) return null;
  return `${base}/u/${encodeURIComponent(trimmedToken)}`;
}

export function unsubscribeHeaders(
  publicUrl: string,
  token: string,
): { listUnsubscribe: string; listUnsubscribePost: string } | null {
  const href = unsubscribeUrl(publicUrl, token);
  if (!href) return null;
  if (href.toLowerCase().includes("mailto:")) return null;
  return {
    listUnsubscribe: `<${href}>`,
    listUnsubscribePost: LIST_UNSUBSCRIBE_POST,
  };
}

/** Replace `{{unsubscribe_link}}` and `{{unsubscribe_link|fallback}}`. Leave the body alone when the placeholder was removed. */
export function applyUnsubscribeLink(body: string, url: string): string {
  return body.replace(/\{\{\s*unsubscribe_link(?:\|[^}]*)?\s*\}\}/gi, url);
}
