import { describe, expect, it } from "vitest";
import { isSuppressed, normalizeSuppression, suppressionForStatus } from "./suppression.js";

describe("suppression", () => {
  it("matches a whole domain exactly and an email after lower-casing", () => {
    const entries = [
      { kind: "domain" as const, value: "harbor-dental.test" },
      { kind: "email" as const, value: "ada@other.test" },
    ];
    expect(isSuppressed("Jane@Harbor-Dental.test", entries)).toBe(true);
    expect(isSuppressed("ada@other.test", entries)).toBe(true);
    expect(isSuppressed("ada@not-harbor-dental.test", entries)).toBe(false);
    expect(isSuppressed("sam@other.test", entries)).toBe(false);
  });

  it("normalizes a domain written with @ and rejects an email in the domain field", () => {
    expect(normalizeSuppression("domain", "@Harbor-Dental.test.")).toEqual({
      ok: true,
      value: "harbor-dental.test",
    });
    expect(normalizeSuppression("domain", "jane@harbor-dental.test").ok).toBe(false);
    expect(normalizeSuppression("email", "Jane@Harbor-Dental.test")).toEqual({
      ok: true,
      value: "jane@harbor-dental.test",
    });
  });

  it("adds bounced and unsubscribed addresses, and leaves the other statuses alone", () => {
    expect(suppressionForStatus("bounced", "Jane@Harbor-Dental.test")).toEqual({
      kind: "email",
      value: "jane@harbor-dental.test",
      reason: "bounced",
    });
    expect(suppressionForStatus("unsubscribed", "jane@harbor-dental.test")).toEqual({
      kind: "email",
      value: "jane@harbor-dental.test",
      reason: "unsubscribed",
    });
    expect(suppressionForStatus("active", "jane@harbor-dental.test")).toBeNull();
    expect(suppressionForStatus("replied", "jane@harbor-dental.test")).toBeNull();
    expect(suppressionForStatus("invalid", "jane@harbor-dental.test")).toBeNull();
    expect(suppressionForStatus("risky", "jane@harbor-dental.test")).toBeNull();
  });
});
