import { escapeHtml, sanitizeHtml } from "./html.js";

const TOKEN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\|\s*([^}]*?))?\s*\}\}/g;

const STANDARD_FIELDS = new Set([
  "first_name",
  "last_name",
  "company",
  "title",
  "email",
  "unsubscribe_link",
]);

export type TemplateContact = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
  customFields?: Record<string, string | null | undefined> | null;
  unsubscribeLink?: string | null;
};

export type StepContentType = "text" | "html";

export type TemplateStep = {
  subject: string;
  body: string;
  contentType: StepContentType;
};

export type StepPreview = {
  subject: string;
  body: string;
  contentType: StepContentType;
  warnings: string[];
};

export function isStandardField(name: string): boolean {
  return STANDARD_FIELDS.has(name.toLowerCase());
}

export function renderTemplate(
  template: string,
  contact: TemplateContact,
  options?: { escapeValues?: boolean },
): string {
  const custom = customLookup(contact.customFields);
  return template.replace(TOKEN, (_raw, field: string, fallback: string | undefined) => {
    const value = lookupField(contact, custom, field);
    if (value !== null) {
      return options?.escapeValues ? escapeHtml(value) : value;
    }
    if (fallback !== undefined) return fallback;
    return "";
  });
}

export function previewStep(step: TemplateStep, contact: TemplateContact): StepPreview {
  const contentType = step.contentType === "html" ? "html" : "text";
  const bodyTemplate = contentType === "html" ? sanitizeHtml(step.body) : step.body;
  const warnings: string[] = [];
  if (!hasUnsubscribeToken(step.body)) {
    warnings.push(
      "This step does not include {{unsubscribe_link}}, so the email will not show an unsubscribe line.",
    );
  }
  return {
    subject: collapseWhitespace(renderTemplate(step.subject, contact)),
    body: renderTemplate(bodyTemplate, contact, { escapeValues: contentType === "html" }),
    contentType,
    warnings,
  };
}

export function hasUnsubscribeToken(body: string): boolean {
  return /\{\{\s*unsubscribe_link\b/i.test(body);
}

export function bodyText(step: Pick<TemplateStep, "body" | "contentType">): string {
  if (step.contentType === "html") {
    return sanitizeHtml(step.body)
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }
  return step.body.trim();
}

function lookupField(
  contact: TemplateContact,
  custom: Map<string, string>,
  field: string,
): string | null {
  const key = field.toLowerCase();
  const direct = standardValue(contact, key);
  if (direct !== undefined) return present(direct);
  if (custom.has(key)) return present(custom.get(key) ?? "");
  return null;
}

function standardValue(contact: TemplateContact, key: string): string | null | undefined {
  switch (key) {
    case "first_name":
      return contact.firstName;
    case "last_name":
      return contact.lastName;
    case "company":
      return contact.company;
    case "title":
      return contact.title;
    case "email":
      return contact.email;
    case "unsubscribe_link":
      return contact.unsubscribeLink;
    default:
      return undefined;
  }
}

function present(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function customLookup(
  fields: TemplateContact["customFields"],
): Map<string, string> {
  const map = new Map<string, string>();
  if (!fields) return map;
  for (const [key, value] of Object.entries(fields)) {
    map.set(key.toLowerCase(), value ?? "");
  }
  return map;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
