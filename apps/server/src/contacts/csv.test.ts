import { describe, expect, it } from "vitest";
import { parseCsv, suggestColumnMapping } from "./csv.js";

describe("parseCsv", () => {
  it("parses commas, quotes, escaped quotes, and newlines inside quotes", () => {
    const table = parseCsv(
      'email,note\r\n"jane@harbor-dental.test","say ""hi"",\nplease"\n',
    );
    expect(table).toEqual([
      ["email", "note"],
      ["jane@harbor-dental.test", 'say "hi",\nplease'],
    ]);
  });

  it("strips a leading byte order mark", () => {
    expect(parseCsv("\uFEFFemail\na@b.test\n")).toEqual([["email"], ["a@b.test"]]);
  });

  it("rejects an unclosed quote", () => {
    expect(() => parseCsv('"jane@harbor-dental.test')).toThrow(/Unclosed quote/);
  });
});

describe("suggestColumnMapping", () => {
  it("maps common headers and keeps an extra column as a custom field", () => {
    const mapping = suggestColumnMapping(
      [
        ["Email", "First Name", "Company", "City"],
        ["jane@harbor-dental.test", "Jane", "Harbor Dental", "Lisbon"],
      ],
      true,
    );
    expect(mapping).toEqual([
      { index: 0, field: "email" },
      { index: 1, field: "first_name" },
      { index: 2, field: "company" },
      { index: 3, field: "custom:city" },
    ]);
  });

  it("picks the column that looks like email when there is no header", () => {
    const mapping = suggestColumnMapping(
      [
        ["Jane", "jane@harbor-dental.test"],
        ["Sam", "sam@harbor-dental.test"],
      ],
      false,
    );
    expect(mapping).toEqual([
      { index: 0, field: "ignore" },
      { index: 1, field: "email" },
    ]);
  });
});
