import { timingSafeEqual } from "node:crypto";
import { generateToken, hashToken } from "./tokens.js";

export function hashApiKey(plaintext: string): string {
  return hashToken(plaintext);
}

export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const { plaintext, hash } = generateToken("wsk");
  return { plaintext, hash, prefix: plaintext.slice(0, 12) };
}

export function verifyApiKey(plaintext: string, hash: string): boolean {
  const actual = Buffer.from(hashApiKey(plaintext), "hex");
  const expected = Buffer.from(hash, "hex");
  if (actual.length === 0 || actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
