export type InboxBadgeTone = "reply" | "auto_reply" | "bounce" | "neutral";

export interface InboxBadge {
  label: string;
  tone: InboxBadgeTone;
}

/** The auto-reply label is the exact string the inbox shows. */
export function inboxBadge(kind: string): InboxBadge {
  switch (kind) {
    case "sent":
      return { label: "Sent", tone: "neutral" };
    case "reply":
      return { label: "Reply", tone: "reply" };
    case "auto_reply":
      return { label: "auto-reply", tone: "auto_reply" };
    case "bounce":
      return { label: "Bounce", tone: "bounce" };
    case "delivery_delay":
      return { label: "Delayed", tone: "neutral" };
    case "other":
      return { label: "Other", tone: "neutral" };
    default:
      return { label: "Unmatched", tone: "neutral" };
  }
}

/** Thread badges arrive lower-case from the API ("sent", "reply", "auto-reply"); show them capitalised. */
export function threadBadgeLabel(badge: string): string {
  if (badge === "auto-reply") return badge;
  return badge.charAt(0).toUpperCase() + badge.slice(1);
}

export function interestLabel(interest: "interested" | "not_interested" | null): string | null {
  if (interest === "interested") return "Interested";
  if (interest === "not_interested") return "Not interested";
  return null;
}
