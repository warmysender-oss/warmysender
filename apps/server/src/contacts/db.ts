import { and, eq } from "drizzle-orm";
import { contacts, listMembers, lists, suppressions, type AppDatabase } from "@warmysender/core";
import { isUniqueViolation } from "../http.js";
import { UserInputError } from "./service.js";
import { isContactStatus, type ContactRecord, type ContactStore, type SuppressionKind } from "./types.js";

export function createDrizzleContactStore(db: AppDatabase): ContactStore {
  return {
    async listContacts() {
      const rows = await db.select().from(contacts);
      return rows.map(toContact);
    },
    async insertContacts(rows) {
      if (rows.length === 0) return;
      try {
        await db.insert(contacts).values(
          rows.map((row) => ({
            id: row.id,
            email: row.email,
            firstName: row.firstName ?? "",
            lastName: row.lastName ?? "",
            company: row.company ?? "",
            title: row.title ?? "",
            customFields: row.customFields,
            status: row.status,
          })),
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new UserInputError("A contact with that email already exists. Import again to skip duplicates.");
        }
        throw error;
      }
    },
    async updateContact(row) {
      await db
        .update(contacts)
        .set({
          email: row.email,
          firstName: row.firstName ?? "",
          lastName: row.lastName ?? "",
          company: row.company ?? "",
          title: row.title ?? "",
          customFields: row.customFields,
          status: row.status,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, row.id));
    },
    async listLists() {
      const rows = await db.select().from(lists);
      return rows.map((row) => ({ id: row.id, name: row.name }));
    },
    async insertList(row) {
      await db.insert(lists).values({ id: row.id, name: row.name });
    },
    async deleteList(id) {
      await db.delete(lists).where(eq(lists.id, id));
    },
    async listMemberships() {
      const rows = await db.select().from(listMembers);
      return rows.map((row) => ({ listId: row.listId, contactId: row.contactId }));
    },
    async insertMemberships(rows) {
      if (rows.length === 0) return;
      await db.insert(listMembers).values(rows.map((row) => ({ listId: row.listId, contactId: row.contactId })));
    },
    async deleteMembership(listId, contactId) {
      await db
        .delete(listMembers)
        .where(and(eq(listMembers.listId, listId), eq(listMembers.contactId, contactId)));
    },
    async deleteMembershipsForList(listId) {
      await db.delete(listMembers).where(eq(listMembers.listId, listId));
    },
    async listSuppressions() {
      const rows = await db.select().from(suppressions);
      return rows.map((row) => ({
        id: row.id,
        kind: asKind(row.kind),
        value: row.value,
        reason: row.reason,
      }));
    },
    async insertSuppression(row) {
      await db.insert(suppressions).values({
        id: row.id,
        kind: row.kind,
        value: row.value,
        reason: row.reason,
      });
    },
    async deleteSuppression(id) {
      await db.delete(suppressions).where(eq(suppressions.id, id));
    },
  };
}

function toContact(row: typeof contacts.$inferSelect): ContactRecord {
  if (!isContactStatus(row.status)) throw new Error(`Unknown contact status ${row.status}.`);
  return {
    id: row.id,
    email: row.email,
    firstName: blankToNull(row.firstName),
    lastName: blankToNull(row.lastName),
    company: blankToNull(row.company),
    title: blankToNull(row.title),
    customFields: readCustom(row.customFields),
    status: row.status,
  };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readCustom(value: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" && raw.trim().length > 0) fields[key] = raw;
    else if (typeof raw === "number" || typeof raw === "boolean") fields[key] = String(raw);
  }
  return fields;
}

function asKind(value: string): SuppressionKind {
  if (value === "email" || value === "domain") return value;
  throw new Error(`Unknown suppression kind ${value}.`);
}
