import type { InboundMail } from "./types.js";

export interface AutoReplyDetection {
  isAutoReply: boolean;
  signals: string[];
}

/**
 * Subject signals apply after Re/Fw/Fwd prefixes are removed.
 * "Re: Intro" is not an auto-reply. "Out of Office Re: Intro" is.
 */
const AUTO_SUBJECTS: Array<{ id: string; pattern: RegExp }> = [
  { id: "out-of-office", pattern: /^out of (?:the )?office\b/i },
  { id: "automatic-reply", pattern: /^automatic reply\b/i },
  { id: "auto-reply", pattern: /^auto(?:matic)?[- ]?reply\b/i },
  { id: "ooo", pattern: /^ooo\b/i },
  { id: "away", pattern: /^(?:i am |i'm )?(?:currently )?(?:away from (?:the )?office|on vacation)\b/i },
];

function header(mail: InboundMail, name: string): string | null {
  const value = mail.headers[name.toLowerCase()];
  return value === undefined ? null : value;
}

function affirmative(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "" || normalized === "yes" || normalized === "true" || normalized === "1") return true;
  return false;
}

export function detectAutoReply(mail: Pick<InboundMail, "subject" | "headers">): AutoReplyDetection {
  const signals: string[] = [];
  const autoSubmitted = header(mail as InboundMail, "auto-submitted");
  if (autoSubmitted !== null) {
    const normalized = autoSubmitted.trim().toLowerCase();
    if (normalized !== "" && normalized !== "no") {
      signals.push(`auto-submitted:${normalized}`);
    }
  }
  const autoreply = header(mail as InboundMail, "x-autoreply");
  if (autoreply !== null && affirmative(autoreply)) signals.push("x-autoreply");
  const autorespond = header(mail as InboundMail, "x-autorespond");
  if (autorespond !== null && affirmative(autorespond)) signals.push("x-autorespond");

  const stripped = mail.subject.replace(/^(?:(?:re|fw|fwd)\s*(?:\[\d+\])?\s*:\s*)+/i, "").trim();
  for (const candidate of AUTO_SUBJECTS) {
    if (candidate.pattern.test(stripped)) {
      signals.push(`subject:${candidate.id}`);
      break;
    }
  }
  return { isAutoReply: signals.length > 0, signals };
}
