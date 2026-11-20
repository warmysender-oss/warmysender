import { isBlankRow } from "./csv.js";
import { normalizeEmail } from "./email.js";
import { isSuppressed, type SuppressionEntry } from "./suppression.js";
import type { ColumnMapping, ContactRecord, MappedField } from "./types.js";

export type ImportSkipReason = "duplicate" | "invalid_syntax" | "suppressed";

export type ParsedContact = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  customFields: Record<string, string>;
};

export type ImportRowResult =
  | { row: number; outcome: "imported"; email: string; contact: ParsedContact }
  | { row: number; outcome: "skipped"; reason: ImportSkipReason; email?: string };

export type ImportReport = {
  imported: number;
  skipped: {
    duplicate: number;
    invalidSyntax: number;
    suppressed: number;
  };
  summary: string;
  rows: ImportRowResult[];
};

const CUSTOM_KEY = /^custom:([a-z][a-z0-9_]{0,40})$/;
const RESERVED_CUSTOM = new Set([
  "email",
  "first_name",
  "last_name",
  "company",
  "title",
  "unsubscribe_link",
]);

export function prepareMapping(mapping: ColumnMapping): { ok: true } | { ok: false; error: string } {
  const seen = new Set<string>();
  let emailColumns = 0;
  for (const column of mapping) {
    if (!Number.isInteger(column.index) || column.index < 0) {
      return { ok: false, error: "Column mapping has an invalid column." };
    }
    if (column.field === "ignore") continue;
    if (column.field === "email") emailColumns += 1;
    const custom = CUSTOM_KEY.exec(column.field);
    if (column.field.startsWith("custom:")) {
      if (!custom || RESERVED_CUSTOM.has(custom[1] ?? "")) {
        return { ok: false, error: `Custom field "${column.field}" is not a valid field name.` };
      }
    } else if (!isStandard(column.field)) {
      return { ok: false, error: `Unknown column field "${column.field}".` };
    }
    if (seen.has(column.field)) {
      return { ok: false, error: `Two columns are mapped to ${column.field}.` };
    }
    seen.add(column.field);
  }
  if (emailColumns !== 1) return { ok: false, error: "Map one column to email. Email is required." };
  return { ok: true };
}

export function importContacts(input: {
  rows: string[][];
  mapping: ColumnMapping;
  existingEmails: Iterable<string>;
  suppressions: SuppressionEntry[];
  firstDataRowNumber: number;
}): ImportReport {
  const existing = new Set<string>();
  for (const email of input.existingEmails) {
    const normalized = normalizeEmail(email);
    if (normalized) existing.add(normalized);
  }
  const seen = new Set<string>();
  const results: ImportRowResult[] = [];
  const counts = { imported: 0, duplicate: 0, invalidSyntax: 0, suppressed: 0 };

  input.rows.forEach((row, offset) => {
    if (isBlankRow(row)) return;
    const rowNumber = input.firstDataRowNumber + offset;
    const contact = applyMapping(row, input.mapping);
    if (!contact) {
      counts.invalidSyntax += 1;
      results.push({ row: rowNumber, outcome: "skipped", reason: "invalid_syntax" });
      return;
    }
    if (isSuppressed(contact.email, input.suppressions)) {
      counts.suppressed += 1;
      results.push({
        row: rowNumber,
        outcome: "skipped",
        reason: "suppressed",
        email: contact.email,
      });
      return;
    }
    if (existing.has(contact.email) || seen.has(contact.email)) {
      counts.duplicate += 1;
      results.push({
        row: rowNumber,
        outcome: "skipped",
        reason: "duplicate",
        email: contact.email,
      });
      return;
    }
    seen.add(contact.email);
    counts.imported += 1;
    results.push({ row: rowNumber, outcome: "imported", email: contact.email, contact });
  });

  return {
    imported: counts.imported,
    skipped: {
      duplicate: counts.duplicate,
      invalidSyntax: counts.invalidSyntax,
      suppressed: counts.suppressed,
    },
    summary: formatImportSummary(counts),
    rows: results,
  };
}

export function formatImportSummary(counts: {
  imported: number;
  duplicate: number;
  invalidSyntax: number;
  suppressed: number;
}): string {
  const skipped = counts.duplicate + counts.invalidSyntax + counts.suppressed;
  return `${counts.imported} imported / ${skipped} skipped (${counts.duplicate} duplicate, ${counts.invalidSyntax} invalid syntax, ${counts.suppressed} suppressed)`;
}

export function toContactRecord(
  id: string,
  contact: ParsedContact,
): ContactRecord {
  return {
    id,
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.company,
    title: contact.title,
    customFields: contact.customFields,
    status: "active",
  };
}

function applyMapping(row: string[], mapping: ColumnMapping): ParsedContact | null {
  let email = "";
  let firstName: string | null = null;
  let lastName: string | null = null;
  let company: string | null = null;
  let title: string | null = null;
  const customFields: Record<string, string> = {};

  for (const column of mapping) {
    if (column.field === "ignore") continue;
    const value = (row[column.index] ?? "").trim();
    if (column.field === "email") {
      email = value;
      continue;
    }
    if (column.field === "first_name") {
      firstName = emptyToNull(value);
      continue;
    }
    if (column.field === "last_name") {
      lastName = emptyToNull(value);
      continue;
    }
    if (column.field === "company") {
      company = emptyToNull(value);
      continue;
    }
    if (column.field === "title") {
      title = emptyToNull(value);
      continue;
    }
    const custom = CUSTOM_KEY.exec(column.field);
    if (custom && value.length > 0) customFields[custom[1] ?? ""] = value;
  }

  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return { email: normalized, firstName, lastName, company, title, customFields };
}

function emptyToNull(value: string): string | null {
  return value.length > 0 ? value : null;
}

function isStandard(field: MappedField): boolean {
  return (
    field === "email" ||
    field === "first_name" ||
    field === "last_name" ||
    field === "company" ||
    field === "title" ||
    field === "ignore"
  );
}
