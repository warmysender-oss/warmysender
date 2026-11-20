const ENCODED_WORD = /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g;

export function decodeHeaderWords(value: string): string {
  const joined = value.replace(/\?=\s+=\?/g, "?==?");
  return joined.replace(ENCODED_WORD, (_full, _charset: string, encoding: string, data: string) => {
    if (encoding.toLowerCase() === "q") {
      const bytes: number[] = [];
      const expanded = data.replace(/_/g, " ");
      for (let i = 0; i < expanded.length; i += 1) {
        if (expanded[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(expanded.slice(i + 1, i + 3))) {
          bytes.push(Number.parseInt(expanded.slice(i + 1, i + 3), 16));
          i += 2;
          continue;
        }
        bytes.push(expanded.charCodeAt(i) & 0xff);
      }
      return Buffer.from(bytes).toString("utf8");
    }
    return Buffer.from(data, "base64").toString("utf8");
  });
}

export function decodeQuotedPrintable(input: string): string {
  const softBreaksRemoved = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < softBreaksRemoved.length; i += 1) {
    const char = softBreaksRemoved[i];
    if (char === "=" && /^[0-9A-Fa-f]{2}$/.test(softBreaksRemoved.slice(i + 1, i + 3))) {
      bytes.push(Number.parseInt(softBreaksRemoved.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    bytes.push((char ?? "").charCodeAt(0) & 0xff);
  }
  return Buffer.from(bytes).toString("utf8");
}

export function decodeBody(body: string, transferEncoding: string | null): string {
  const encoding = transferEncoding?.trim().toLowerCase() ?? "7bit";
  if (encoding === "base64") {
    const compact = body.replace(/\s+/g, "");
    return Buffer.from(compact, "base64").toString("utf8");
  }
  if (encoding === "quoted-printable") return decodeQuotedPrintable(body);
  return body;
}

const EMAIL = /([a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+)/i;

export function extractEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(EMAIL);
  return match?.[1]?.toLowerCase() ?? null;
}

const REPLY_PREFIX = /^(?:(?:re|fw|fwd)\s*(?:\[\d+\])?\s*:\s*)+/i;

/** Subject used for the sender+subject fallback. Strips Re/Fw/Fwd prefixes. */
export function normalizeSubject(subject: string): string {
  return subject.replace(REPLY_PREFIX, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeMessageId(raw: string): string {
  let value = raw.trim();
  if (value.startsWith("<") && value.endsWith(">") && value.indexOf("<", 1) === -1) {
    value = value.slice(1, -1).trim();
  }
  return value.toLowerCase();
}

export function extractMessageIds(value: string | null | undefined): string[] {
  if (!value) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const normalized = normalizeMessageId(raw);
    if (!normalized || seen.has(normalized) || !normalized.includes("@")) return;
    seen.add(normalized);
    ids.push(normalized);
  };
  const bracketed = value.match(/<[^<>\s]+>/g);
  if (bracketed && bracketed.length > 0) {
    for (const item of bracketed) add(item);
    return ids;
  }
  for (const token of value.split(/[\s,]+/)) {
    if (token) add(token);
  }
  return ids;
}

export function bracketMessageId(id: string): string {
  const normalized = normalizeMessageId(id);
  return `<${normalized}>`;
}
