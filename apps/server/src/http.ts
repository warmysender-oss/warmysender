export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && (error as { code?: unknown }).code === "23505") return true;
  if ("cause" in error) return isUniqueViolation((error as { cause?: unknown }).cause);
  return false;
}

export function publicUser(user: { id: string; email: string; name: string; role: string }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length === 0 || email.length > 320 || !EMAIL.test(email)) return null;
  return email;
}

export function readPassword(input: unknown): string | null {
  if (typeof input !== "string") return null;
  if (input.length < 10 || input.length > 200) return null;
  return input;
}

export function readName(input: unknown): string {
  if (input === undefined || input === null) return "";
  if (typeof input !== "string") return "";
  return input.trim().slice(0, 120);
}
