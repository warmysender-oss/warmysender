/** View models for the contacts screens. Status values match the server contact record. */

export const CONTACT_STATUSES = [
  "active",
  "replied",
  "bounced",
  "unsubscribed",
  "invalid",
  "risky",
] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export type MappedField =
  | "email"
  | "first_name"
  | "last_name"
  | "company"
  | "title"
  | "ignore"
  | `custom:${string}`;

export type ColumnMapping = Array<{ index: number; field: MappedField }>;

export type ContactRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  status: ContactStatus;
  listIds: string[];
  suppressed: boolean;
};

export type ListRow = {
  id: string;
  name: string;
};

export type SuppressionRow = {
  id: string;
  kind: "email" | "domain";
  value: string;
};

export type CsvPreview = {
  headers: string[];
  mapping: ColumnMapping;
  sampleRows: string[][];
  dataRowCount: number;
};

export type ImportReportView = {
  imported: number;
  skipped: { duplicate: number; invalidSyntax: number; suppressed: number };
  summary: string;
};
