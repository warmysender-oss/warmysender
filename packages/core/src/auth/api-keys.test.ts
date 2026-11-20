import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, verifyApiKey } from "./api-keys.js";

describe("API key hashing", () => {
  it("stores a hash, not the key, and verifies it", () => {
    const first = generateApiKey();
    const second = generateApiKey();
    expect(first.plaintext.startsWith("wsk_")).toBe(true);
    expect(first.prefix).toBe(first.plaintext.slice(0, 12));
    expect(first.hash).toBe(hashApiKey(first.plaintext));
    expect(first.hash).not.toContain(first.plaintext);
    expect(first.hash).not.toContain(first.plaintext.slice(4));
    expect(verifyApiKey(first.plaintext, first.hash)).toBe(true);
    expect(verifyApiKey(second.plaintext, first.hash)).toBe(false);
    expect(verifyApiKey(`${first.plaintext}x`, first.hash)).toBe(false);
    expect(first.plaintext).not.toBe(second.plaintext);
    expect(first.hash).not.toBe(second.hash);
  });

  it("hashes the same key to the same digest", () => {
    const { plaintext } = generateApiKey();
    expect(hashApiKey(plaintext)).toBe(hashApiKey(plaintext));
  });
});
