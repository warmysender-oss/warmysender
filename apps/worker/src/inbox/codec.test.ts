import { describe, expect, it } from "vitest";
import { decodeHeaderWords, extractEmail, extractMessageIds, normalizeSubject } from "./codec.js";

describe("header decoding", () => {
  it("decodes quoted-printable encoded words and underscores", () => {
    expect(decodeHeaderWords("=?UTF-8?Q?Out_of_Office?= Re: Intro")).toBe("Out of Office Re: Intro");
  });

  it("joins adjacent encoded words", () => {
    expect(decodeHeaderWords("=?UTF-8?Q?Out?= =?UTF-8?Q?_of_Office?=")).toBe("Out of Office");
  });

  it("decodes base64 encoded words", () => {
    expect(decodeHeaderWords("=?UTF-8?B?T3V0IG9mIE9mZmljZQ==?=")).toBe("Out of Office");
  });
});

describe("addresses and subjects", () => {
  it("extracts an address from a display name", () => {
    expect(extractEmail("Jane Smith <Jane@River-Clinic.test>")).toBe("jane@river-clinic.test");
  });

  it("strips reply and forward prefixes", () => {
    expect(normalizeSubject("Re: Intro")).toBe("intro");
    expect(normalizeSubject("RE[2]:  Intro")).toBe("intro");
    expect(normalizeSubject("Fwd: Re: Intro")).toBe("intro");
  });
});

describe("message ids", () => {
  it("normalizes brackets and case", () => {
    expect(extractMessageIds("<Campaign-Step1@Harbor-Dental.test>")).toEqual(["campaign-step1@harbor-dental.test"]);
  });

  it("keeps references in order and drops duplicates", () => {
    expect(
      extractMessageIds("<a@harbor-dental.test> <b@harbor-dental.test> <a@harbor-dental.test>"),
    ).toEqual(["a@harbor-dental.test", "b@harbor-dental.test"]);
  });

  it("accepts a bare id", () => {
    expect(extractMessageIds("campaign-step1@harbor-dental.test")).toEqual(["campaign-step1@harbor-dental.test"]);
  });
});
