import { renderTemplate, type TemplateContact } from "../campaigns/template.js";

const TOKEN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(\|[^}]*)?\s*\}\}/g;

/**
 * A variable with no `|fallback` must have a value. `renderTemplate` turns a
 * miss into an empty string; the sender refuses that send instead.
 * `{{name|}}` is an explicit empty fallback and is allowed.
 */
export function missingRequiredVariables(template: string, contact: TemplateContact): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const match of template.matchAll(TOKEN)) {
    const field = match[1];
    if (!field) continue;
    if (match[2] !== undefined) continue;
    const key = field.toLowerCase();
    if (seen.has(key)) continue;
    if (renderTemplate(`{{${field}}}`, contact) === "") {
      seen.add(key);
      missing.push(key);
    }
  }
  return missing;
}

export function templateContact(input: {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
  customFields?: Readonly<Record<string, string | null | undefined>> | null;
  unsubscribeLink?: string | null;
}): TemplateContact {
  return {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    company: input.company,
    title: input.title,
    customFields: input.customFields ?? {},
    unsubscribeLink: input.unsubscribeLink,
  };
}

export function appendSignature(body: string, signature: string, html: boolean): string {
  const trimmed = signature.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return body;
  const base = body.replace(/\s+$/, "");
  if (!html) return `${base}\n\n${trimmed}`;
  const safe = trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return `${base}<br><br>${safe}`;
}
