const EMAIL =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const DOMAIN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function isValidEmailSyntax(raw: string): boolean {
  const email = raw.trim();
  if (email.length === 0 || email.length > 254) return false;
  if (email.includes("..")) return false;
  return EMAIL.test(email);
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return isValidEmailSyntax(email) ? email : null;
}

export function isValidDomain(raw: string): boolean {
  const domain = raw.trim().toLowerCase();
  if (domain.length === 0 || domain.length > 253) return false;
  if (domain.includes("..")) return false;
  return DOMAIN.test(domain);
}
