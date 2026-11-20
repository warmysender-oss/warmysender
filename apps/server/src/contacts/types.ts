export const CONTACT_STATUSES = [
  "active",
  "replied",
  "bounced",
  "unsubscribed",
  "invalid",
  "risky",
] as const;

export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export type StandardField = "email" | "first_name" | "last_name" | "company" | "title";

export type MappedField = StandardField | "ignore" | `custom:${string}`;

export type ColumnMapping = Array<{
  index: number;
  field: MappedField;
}>;

export type ContactRecord = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  customFields: Record<string, string>;
  status: ContactStatus;
};

export type ListRecord = {
  id: string;
  name: string;
};

export type MembershipRecord = {
  listId: string;
  contactId: string;
};

export type SuppressionKind = "email" | "domain";

export type SuppressionRecord = {
  id: string;
  kind: SuppressionKind;
  value: string;
  /** Why the row exists. Empty when someone added it by hand. */
  reason: string;
};

export type ContactStore = {
  listContacts(): Promise<ContactRecord[]>;
  insertContacts(rows: ContactRecord[]): Promise<void>;
  updateContact(row: ContactRecord): Promise<void>;
  listLists(): Promise<ListRecord[]>;
  insertList(row: ListRecord): Promise<void>;
  deleteList(id: string): Promise<void>;
  listMemberships(): Promise<MembershipRecord[]>;
  insertMemberships(rows: MembershipRecord[]): Promise<void>;
  deleteMembership(listId: string, contactId: string): Promise<void>;
  deleteMembershipsForList(listId: string): Promise<void>;
  listSuppressions(): Promise<SuppressionRecord[]>;
  insertSuppression(row: SuppressionRecord): Promise<void>;
  deleteSuppression(id: string): Promise<void>;
};

export function isContactStatus(value: string): value is ContactStatus {
  return (CONTACT_STATUSES as readonly string[]).includes(value);
}
