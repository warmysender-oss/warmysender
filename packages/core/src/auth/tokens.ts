import { createHash, randomBytes } from "node:crypto";

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateToken(prefix: string): { plaintext: string; hash: string } {
  const plaintext = `${prefix}_${randomBytes(32).toString("base64url")}`;
  return { plaintext, hash: hashToken(plaintext) };
}
