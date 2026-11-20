import { isValidEmailSyntax } from "./email.js";
import type { ColumnMapping, MappedField, StandardField } from "./types.js";

export class CsvParseError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(message);
    this.name = "CsvParseError";
    this.line = line;
  }
}

const HEADER_ALIASES: Record<string, StandardField> = {
  email: "email",
  "e mail": "email",
  "email address": "email",
  "first name": "first_name",
  firstname: "first_name",
  "given name": "first_name",
  "last name": "last_name",
  lastname: "last_name",
  surname: "last_name",
  "family name": "last_name",
  company: "company",
  "company name": "company",
  organization: "company",
  organisation: "company",
  title: "title",
  "job title": "title",
  position: "title",
};

const STANDARD = new Set<string>([
  "email",
  "first_name",
  "last_name",
  "company",
  "title",
  "unsubscribe_link",
]);

export function parseCsv(text: string): string[][] {
  let source = text;
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  let index = 0;
  while (index < source.length) {
    const char = source[index] ?? "";
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      if (char === "\n") line += 1;
      field += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      if (field.length === 0) {
        inQuotes = true;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      index += 1;
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      pushField();
      pushRow();
      line += 1;
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  if (inQuotes) throw new CsvParseError("Unclosed quote in the CSV.", line);
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  return rows;
}

export function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim().length === 0);
}

export function suggestColumnMapping(table: string[][], hasHeader: boolean): ColumnMapping {
  if (table.length === 0) return [];
  const width = table.reduce((max, row) => Math.max(max, row.length), 0);
  if (hasHeader) return mappingFromHeaders(table[0] ?? [], width);
  return mappingFromValues(table, width);
}

function mappingFromHeaders(headers: string[], width: number): ColumnMapping {
  const mapping: ColumnMapping = [];
  const usedStandard = new Set<string>();
  const usedCustom = new Set<string>();
  for (let index = 0; index < width; index += 1) {
    const header = (headers[index] ?? "").trim();
    const alias = HEADER_ALIASES[headerKey(header)];
    if (alias && !usedStandard.has(alias)) {
      usedStandard.add(alias);
      mapping.push({ index, field: alias });
      continue;
    }
    if (header.length === 0) {
      mapping.push({ index, field: "ignore" });
      continue;
    }
    const slug = uniqueCustom(slugify(header), usedCustom);
    mapping.push({ index, field: `custom:${slug}` });
  }
  return mapping;
}

function mappingFromValues(table: string[][], width: number): ColumnMapping {
  let bestIndex = -1;
  let bestScore = 0;
  for (let index = 0; index < width; index += 1) {
    const score = table.reduce((count, row) => {
      return count + (isValidEmailSyntax((row[index] ?? "").trim()) ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return Array.from({ length: width }, (_unused, index) => ({
    index,
    field: index === bestIndex ? "email" : "ignore",
  }));
}

export function headerKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function slugify(header: string): string {
  const slug = header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  const trimmed = slug.slice(0, 40).replace(/_+$/g, "");
  if (/^[a-z]/.test(trimmed)) return trimmed;
  return trimmed.length > 0 ? `f_${trimmed}`.slice(0, 40) : "field";
}

function uniqueCustom(base: string, used: Set<string>): string {
  let key = base;
  if (!STANDARD.has(key) && !used.has(key)) {
    used.add(key);
    return key;
  }
  let suffix = 2;
  while (STANDARD.has(`${base}_${suffix}`) || used.has(`${base}_${suffix}`)) suffix += 1;
  key = `${base}_${suffix}`.slice(0, 40);
  used.add(key);
  return key;
}

export function fieldLabel(field: MappedField): string {
  switch (field) {
    case "email":
      return "Email";
    case "first_name":
      return "First name";
    case "last_name":
      return "Last name";
    case "company":
      return "Company";
    case "title":
      return "Title";
    case "ignore":
      return "Ignore";
    default:
      return field.startsWith("custom:") ? field.slice("custom:".length) : field;
  }
}
