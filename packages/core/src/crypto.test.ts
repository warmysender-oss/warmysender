import { describe, expect, it } from "vitest";
import { decryptString, encryptString } from "./crypto.js";

const key = Buffer.alloc(32, 0x21);
const otherKey = Buffer.alloc(32, 0x22);

describe("encryptString", () => {
  it("round-trips text and hides the plaintext", () => {
    const secret = "smtp-password-s3cret";
    const payload = encryptString(secret, key);
    expect(payload).not.toContain(secret);
    expect(decryptString(payload, key)).toBe(secret);
  });

  it("round-trips unicode and an empty string", () => {
    expect(decryptString(encryptString("café — signature", key), key)).toBe("café — signature");
    expect(decryptString(encryptString("", key), key)).toBe("");
  });

  it("uses a fresh IV so two encryptions differ", () => {
    expect(encryptString("same", key)).not.toBe(encryptString("same", key));
  });

  it("rejects a modified payload and the wrong key", () => {
    const payload = encryptString("mailbox-secret", key);
    const buf = Buffer.from(payload, "base64");
    const last = buf.length - 1;
    const byte = buf[last];
    if (byte === undefined) throw new Error("empty payload");
    buf[last] = byte ^ 0xff;
    expect(() => decryptString(buf.toString("base64"), key)).toThrow(/decrypt/);
    expect(() => decryptString(payload, otherKey)).toThrow(/decrypt/);
  });
});
