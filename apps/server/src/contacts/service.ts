import { parseCsv, suggestColumnMapping } from "./csv.js";
import { importContacts, prepareMapping, toContactRecord, type ImportReport } from "./import-contacts.js";
import { cleanListName, membershipsToAdd } from "./lists.js";
import { normalizeSuppression, sameSuppression, suppressionForStatus } from "./suppression.js";
import type {
  ColumnMapping,
  ContactRecord,
  ContactStatus,
  ContactStore,
  ListRecord,
  SuppressionKind,
  SuppressionRecord,
} from "./types.js";
import { isContactStatus } from "./types.js";

export class UserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserInputError";
  }
}

export type ContactClock = {
  id: () => string;
};

const MAX_CSV_CHARS = 5_000_000;
const MAX_DATA_ROWS = 100_000;

export type CsvPreview = {
  headers: string[];
  mapping: ColumnMapping;
  sampleRows: string[][];
  dataRowCount: number;
};

export async function previewImport(
  csv: string,
  hasHeader: boolean,
): Promise<CsvPreview> {
  const table = readTable(csv);
  const data = hasHeader ? table.slice(1) : table;
  return {
    headers: hasHeader ? (table[0] ?? []).map((cell) => cell.trim()) : [],
    mapping: suggestColumnMapping(table, hasHeader),
    sampleRows: data.filter((row) => row.some((cell) => cell.trim().length > 0)).slice(0, 5),
    dataRowCount: data.length,
  };
}

export async function importCsv(
  store: ContactStore,
  clock: ContactClock,
  input: { csv: string; hasHeader: boolean; mapping: ColumnMapping; listIds: string[] },
): Promise<ImportReport & { contactIds: string[] }> {
  const mapping = prepareMapping(input.mapping);
  if (!mapping.ok) throw new UserInputError(mapping.error);
  const lists = await store.listLists();
  const knownLists = new Set(lists.map((list) => list.id));
  for (const listId of input.listIds) {
    if (!knownLists.has(listId)) throw new UserInputError("List not found.");
  }

  const table = readTable(input.csv);
  const data = input.hasHeader ? table.slice(1) : table;
  if (data.length > MAX_DATA_ROWS) {
    throw new UserInputError(`CSV has more than ${MAX_DATA_ROWS} rows.`);
  }
  const [existing, suppressions] = await Promise.all([
    store.listContacts(),
    store.listSuppressions(),
  ]);
  const report = importContacts({
    rows: data,
    mapping: input.mapping,
    existingEmails: existing.map((contact) => contact.email),
    suppressions,
    firstDataRowNumber: input.hasHeader ? 2 : 1,
  });
  const created = report.rows.flatMap((row) => {
    if (row.outcome !== "imported") return [];
    return [toContactRecord(clock.id(), row.contact)];
  });
  if (created.length > 0) await store.insertContacts(created);
  const contactIds = created.map((contact) => contact.id);
  if (input.listIds.length > 0 && contactIds.length > 0) {
    const memberships = await store.listMemberships();
    await store.insertMemberships(membershipsToAdd(memberships, input.listIds, contactIds));
  }
  return { ...report, contactIds };
}

export async function setContactStatus(
  store: ContactStore,
  clock: ContactClock,
  contactId: string,
  status: string,
): Promise<ContactRecord> {
  if (!isContactStatus(status)) throw new UserInputError("Unknown contact status.");
  const contacts = await store.listContacts();
  const contact = contacts.find((row) => row.id === contactId);
  if (!contact) throw new UserInputError("Contact not found.");
  const next: ContactRecord = { ...contact, status: status as ContactStatus };
  await store.updateContact(next);
  const entry = suppressionForStatus(next.status, next.email);
  if (entry) {
    const suppressions = await store.listSuppressions();
    if (!suppressions.some((row) => sameSuppression(row, entry))) {
      await store.insertSuppression({ id: clock.id(), kind: entry.kind, value: entry.value });
    }
  }
  return next;
}

export async function createList(
  store: ContactStore,
  clock: ContactClock,
  name: string,
): Promise<ListRecord> {
  const cleaned = cleanListName(name);
  if (!cleaned.ok) throw new UserInputError(cleaned.error);
  const list = { id: clock.id(), name: cleaned.name };
  await store.insertList(list);
  return list;
}

export async function deleteList(store: ContactStore, listId: string): Promise<void> {
  const lists = await store.listLists();
  if (!lists.some((list) => list.id === listId)) throw new UserInputError("List not found.");
  await store.deleteMembershipsForList(listId);
  await store.deleteList(listId);
}

export async function setContactLists(
  store: ContactStore,
  contactId: string,
  listIds: string[],
): Promise<void> {
  const [contacts, lists, memberships] = await Promise.all([
    store.listContacts(),
    store.listLists(),
    store.listMemberships(),
  ]);
  if (!contacts.some((contact) => contact.id === contactId)) {
    throw new UserInputError("Contact not found.");
  }
  const known = new Set(lists.map((list) => list.id));
  const unique = [...new Set(listIds)];
  for (const listId of unique) {
    if (!known.has(listId)) throw new UserInputError("List not found.");
  }
  const current = memberships.filter((row) => row.contactId === contactId);
  for (const membership of current) {
    if (!unique.includes(membership.listId)) {
      await store.deleteMembership(membership.listId, contactId);
    }
  }
  await store.insertMemberships(
    membershipsToAdd(
      memberships.filter((row) => unique.includes(row.listId) && row.contactId === contactId),
      unique,
      [contactId],
    ),
  );
}

export async function addSuppression(
  store: ContactStore,
  clock: ContactClock,
  kind: SuppressionKind,
  value: string,
): Promise<SuppressionRecord> {
  const normalized = normalizeSuppression(kind, value);
  if (!normalized.ok) throw new UserInputError(normalized.error);
  const existing = await store.listSuppressions();
  const found = existing.find((row) => sameSuppression(row, { kind, value: normalized.value }));
  if (found) return found;
  const created = { id: clock.id(), kind, value: normalized.value };
  await store.insertSuppression(created);
  return created;
}

export async function removeSuppression(store: ContactStore, id: string): Promise<void> {
  const existing = await store.listSuppressions();
  if (!existing.some((row) => row.id === id)) throw new UserInputError("Suppression not found.");
  await store.deleteSuppression(id);
}

function readTable(csv: string): string[][] {
  if (typeof csv !== "string" || csv.trim().length === 0) {
    throw new UserInputError("That CSV is empty.");
  }
  if (csv.length > MAX_CSV_CHARS) throw new UserInputError("CSV is larger than 5 MB.");
  try {
    return parseCsv(csv);
  } catch (error) {
    if (error instanceof Error) throw new UserInputError(error.message);
    throw new UserInputError("Could not read that CSV.");
  }
}
