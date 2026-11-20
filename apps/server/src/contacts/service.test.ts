import { describe, expect, it } from "vitest";
import { createMemoryContactStore } from "./memory-store.js";
import { createContacts, importCsv, setContactLists, setContactStatus } from "./service.js";

function clock() {
  let n = 0;
  return { id: () => `id_${++n}` };
}

const csv = [
  "email,first_name,company",
  "jane@harbor-dental.test,Jane,Harbor",
  "Jane@Harbor-Dental.test,Again,Harbor",
  "nope,Sam,Harbor",
  "sam@blocked.test,Sam,Blocked",
].join("\n");

describe("contact service", () => {
  it("imports into a list, dedupes, and adds suppression when a contact bounces", async () => {
    const store = createMemoryContactStore();
    const ids = clock();
    await store.insertList({ id: "list_1", name: "Clinics" });
    await store.insertSuppression({ id: "sup_1", kind: "domain", value: "blocked.test", reason: "" });

    const report = await importCsv(store, ids, {
      csv,
      hasHeader: true,
      listIds: ["list_1"],
      mapping: [
        { index: 0, field: "email" },
        { index: 1, field: "first_name" },
        { index: 2, field: "company" },
      ],
    });

    expect(report.summary).toBe(
      "1 imported / 3 skipped (1 duplicate, 1 invalid syntax, 1 suppressed)",
    );
    const contacts = await store.listContacts();
    expect(contacts.map((contact) => contact.email)).toEqual(["jane@harbor-dental.test"]);
    expect(await store.listMemberships()).toEqual([
      { listId: "list_1", contactId: contacts[0]?.id },
    ]);

    const bounced = await setContactStatus(store, ids, contacts[0]?.id ?? "", "bounced");
    expect(bounced.status).toBe("bounced");
    expect(await store.listSuppressions()).toEqual([
      { id: "sup_1", kind: "domain", value: "blocked.test", reason: "" },
      { id: "id_2", kind: "email", value: "jane@harbor-dental.test", reason: "bounced" },
    ]);

    await setContactLists(store, bounced.id, []);
    expect(await store.listMemberships()).toEqual([]);
    const lists = await store.listLists();
    expect(lists).toHaveLength(1);
  });

  it("creates structured contacts with the same skip reasons as CSV import", async () => {
    const store = createMemoryContactStore();
    await store.insertSuppression({ id: "sup_1", kind: "domain", value: "blocked.test", reason: "" });
    const result = await createContacts(store, clock(), [
      { email: "Jane@Harbor-Dental.test", firstName: "Jane", company: "Harbor", customFields: { city: "Lisbon" } },
      { email: "jane@harbor-dental.test", firstName: "Again", company: "Harbor" },
      { email: "not-an-email", firstName: "Sam" },
      { email: "sam@blocked.test", firstName: "Sam" },
    ]);
    expect(result.skipped.map((row) => row.reason)).toEqual(["duplicate", "invalid_syntax", "suppressed"]);
    expect(result.created.map((row) => row.email)).toEqual(["jane@harbor-dental.test"]);
    expect(result.created[0]).toMatchObject({ firstName: "Jane", company: "Harbor", customFields: { city: "Lisbon" } });
  });
});
