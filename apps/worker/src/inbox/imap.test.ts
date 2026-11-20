import { describe, expect, it } from "vitest";
import { imapTlsOptions, uidValidityInt } from "./imap.js";

describe("imap connection options", () => {
  it("maps mailbox security onto imapflow TLS flags", () => {
    expect(imapTlsOptions("ssl")).toEqual({ secure: true, doSTARTTLS: false });
    expect(imapTlsOptions("starttls")).toEqual({ secure: false, doSTARTTLS: true });
    expect(imapTlsOptions("none")).toEqual({ secure: false, doSTARTTLS: false });
  });

  it("keeps UIDVALIDITY inside a postgres integer", () => {
    expect(uidValidityInt(12n)).toBe(12);
    expect(uidValidityInt(2_147_483_648n)).toBeNull();
    expect(uidValidityInt(null)).toBeNull();
  });
});
