import { describe, expect, it } from "vitest";
import { importContacts, prepareMapping } from "./import-contacts.js";
import type { ColumnMapping } from "./types.js";

const mapping: ColumnMapping = [
  { index: 0, field: "email" },
  { index: 1, field: "first_name" },
  { index: 2, field: "company" },
  { index: 3, field: "custom:city" },
  { index: 4, field: "ignore" },
];

describe("importContacts", () => {
  it("dedupes by lower-cased email, skips invalid syntax and suppressed rows, and reports the counts", () => {
    const report = importContacts({
      rows: [
        ["Jane@Harbor-Dental.test", "Jane", "Harbor", "Lisbon", "skip me"],
        ["jane@harbor-dental.test", "Again", "Harbor", "Lisbon", ""],
        ["not-an-email", "No", "Harbor", "", ""],
        ["sam@blocked.test", "Sam", "Blocked", "Porto", ""],
        ["", "", "", "", ""],
        ["bea@other.test", "Bea", "", "", ""],
      ],
      mapping,
      existingEmails: ["bea@other.test"],
      suppressions: [{ kind: "domain", value: "blocked.test" }],
      firstDataRowNumber: 2,
    });

    expect(report.summary).toBe(
      "1 imported / 4 skipped (2 duplicate, 1 invalid syntax, 1 suppressed)",
    );
    expect(report.skipped).toEqual({ duplicate: 2, invalidSyntax: 1, suppressed: 1 });
    const imported = report.rows.find((row) => row.outcome === "imported");
    expect(imported).toMatchObject({
      row: 2,
      email: "jane@harbor-dental.test",
      contact: {
        firstName: "Jane",
        company: "Harbor",
        customFields: { city: "Lisbon" },
      },
    });
    expect(report.rows.map((row) => row.row)).toEqual([2, 3, 4, 5, 7]);
  });

  it("requires exactly one email column", () => {
    expect(prepareMapping([{ index: 0, field: "first_name" }]).ok).toBe(false);
    expect(prepareMapping([{ index: 0, field: "email" }, { index: 1, field: "email" }]).ok).toBe(false);
    expect(prepareMapping([{ index: 0, field: "email" }]).ok).toBe(true);
  });

  it("does not treat a lookalike domain as suppressed", () => {
    const report = importContacts({
      rows: [["ada@not-blocked.test", "Ada"]],
      mapping: [
        { index: 0, field: "email" },
        { index: 1, field: "first_name" },
      ],
      existingEmails: [],
      suppressions: [
        { kind: "domain", value: "blocked.test" },
        { kind: "email", value: "ada@blocked.test" },
      ],
      firstDataRowNumber: 1,
    });
    expect(report.imported).toBe(1);
  });
});
