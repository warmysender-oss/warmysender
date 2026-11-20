/** Simple HTML allowed on a step. No images, scripts, or tracking rewrites. */

const BLOCK_WITH_CONTENT =
  /<(script|style|iframe|object|embed|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

const STRAY_BLOCKED =
  /<\/?(?:script|style|iframe|object|embed|noscript|template|img|svg|math|video|audio|source|form|input|button|textarea|select|link|meta|base|frame|frameset)\b[^>]*>/gi;

const ALLOWED = new Set([
  "p",
  "br",
  "hr",
  "a",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "span",
  "div",
  "h1",
  "h2",
  "h3",
  "blockquote",
]);

const VOID_TAGS = new Set(["br", "hr"]);

const TAG = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeHtml(input: string): string {
  let html = input.replace(/<!--[\s\S]*?-->/g, "");
  let previous = "";
  while (html !== previous) {
    previous = html;
    html = html.replace(BLOCK_WITH_CONTENT, "");
  }
  html = html.replace(STRAY_BLOCKED, "");
  return html.replace(TAG, (full, rawName: string, rawAttrs: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED.has(name)) return "";
    const closing = full.startsWith("</");
    if (VOID_TAGS.has(name)) return `<${name}>`;
    if (closing) return `</${name}>`;
    if (name === "a") {
      const href = safeHref(rawAttrs);
      return href ? `<a href="${escapeHtml(href)}">` : "<a>";
    }
    return `<${name}>`;
  });
}

function safeHref(rawAttrs: string): string | null {
  const match = rawAttrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  if (!match) return null;
  const href = (match[2] ?? match[3] ?? match[4] ?? "").trim();
  if (/^\{\{\s*unsubscribe_link\s*\}\}$/i.test(href)) return href;
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href;
  return null;
}
