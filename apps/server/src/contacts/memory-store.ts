import type {
  ContactRecord,
  ContactStore,
  ListRecord,
  MembershipRecord,
  SuppressionRecord,
} from "./types.js";

export function createMemoryContactStore(): ContactStore {
  const contacts: ContactRecord[] = [];
  const lists: ListRecord[] = [];
  const memberships: MembershipRecord[] = [];
  const suppressions: SuppressionRecord[] = [];

  return {
    async listContacts() {
      return contacts.map((row) => ({ ...row, customFields: { ...row.customFields } }));
    },
    async insertContacts(rows) {
      contacts.push(...rows.map((row) => ({ ...row, customFields: { ...row.customFields } })));
    },
    async updateContact(row) {
      const index = contacts.findIndex((contact) => contact.id === row.id);
      if (index === -1) return;
      contacts[index] = { ...row, customFields: { ...row.customFields } };
    },
    async listLists() {
      return lists.map((row) => ({ ...row }));
    },
    async insertList(row) {
      lists.push({ ...row });
    },
    async deleteList(id) {
      const index = lists.findIndex((list) => list.id === id);
      if (index >= 0) lists.splice(index, 1);
    },
    async listMemberships() {
      return memberships.map((row) => ({ ...row }));
    },
    async insertMemberships(rows) {
      memberships.push(...rows.map((row) => ({ ...row })));
    },
    async deleteMembership(listId, contactId) {
      const index = memberships.findIndex(
        (row) => row.listId === listId && row.contactId === contactId,
      );
      if (index >= 0) memberships.splice(index, 1);
    },
    async deleteMembershipsForList(listId) {
      for (let index = memberships.length - 1; index >= 0; index -= 1) {
        if (memberships[index]?.listId === listId) memberships.splice(index, 1);
      }
    },
    async listSuppressions() {
      return suppressions.map((row) => ({ ...row }));
    },
    async insertSuppression(row) {
      suppressions.push({ ...row });
    },
    async deleteSuppression(id) {
      const index = suppressions.findIndex((row) => row.id === id);
      if (index >= 0) suppressions.splice(index, 1);
    },
  };
}
