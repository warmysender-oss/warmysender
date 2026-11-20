/** Strip a run of "Re:" prefixes and add exactly one. */
export function replySubject(previousSubject: string): string {
  const stripped = previousSubject.trim().replace(/^(re:\s*)+/i, "");
  return `Re: ${stripped}`;
}

export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function normalizeMessageId(id: string): string {
  const trimmed = sanitizeHeader(id);
  if (trimmed.startsWith("<") && trimmed.endsWith(">") && trimmed.length > 2) return trimmed;
  return `<${trimmed.replace(/^<|>$/g, "")}>`;
}

/**
 * Step 1 uses the step subject.
 * A follow-up with an empty subject stays in the thread (`Re:` + previous subject).
 * A follow-up with its own subject uses that subject and still threads.
 */
export function resolveSubject(input: {
  stepNumber: number;
  stepSubject: string | null;
  previousSubject: string | null;
}): { ok: true; subject: string } | { ok: false; reason: "missing_subject" } {
  const own = sanitizeHeader(input.stepSubject ?? "");
  if (input.stepNumber <= 1) {
    if (!own) return { ok: false, reason: "missing_subject" };
    return { ok: true, subject: own };
  }
  if (own) return { ok: true, subject: own };
  const previous = sanitizeHeader(input.previousSubject ?? "");
  if (!previous) return { ok: false, reason: "missing_subject" };
  return { ok: true, subject: replySubject(previous) };
}

export function threadingHeaders(input: {
  stepNumber: number;
  previousMessageId: string | null;
  previousReferences: string | null;
}):
  | { ok: true; inReplyTo?: string; references?: string }
  | { ok: false; reason: "missing_thread" } {
  if (input.stepNumber <= 1) return { ok: true };
  const raw = input.previousMessageId?.trim() ?? "";
  if (!raw) return { ok: false, reason: "missing_thread" };
  const inReplyTo = normalizeMessageId(raw);
  const prior = (input.previousReferences ?? "").trim();
  const tokens = `${prior} ${inReplyTo}`.split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const token of tokens) {
    const id = normalizeMessageId(token);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return { ok: true, inReplyTo, references: unique.join(" ") };
}
