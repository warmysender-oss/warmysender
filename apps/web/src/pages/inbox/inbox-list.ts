export type InboxBadgeTone = "reply" | "auto_reply" | "bounce" | "neutral";

export interface InboxBadge {
  label: string;
  tone: InboxBadgeTone;
}

/** The auto-reply label is the exact string the inbox shows. */
export function inboxBadge(kind: string): InboxBadge {
  switch (kind) {
    case "reply":
      return { label: "Reply", tone: "reply" };
    case "auto_reply":
      return { label: "auto-reply", tone: "auto_reply" };
    case "bounce":
      return { label: "Bounce", tone: "bounce" };
    case "delivery_delay":
      return { label: "Delayed", tone: "neutral" };
    default:
      return { label: "Unmatched", tone: "neutral" };
  }
}

export function interestLabel(interest: "interested" | "not_interested" | null): string | null {
  if (interest === "interested") return "Interested";
  if (interest === "not_interested") return "Not interested";
  return null;
}
