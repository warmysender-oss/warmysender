const FIELD_ORDER = [
  "reason",
  "mailbox",
  "enrollment",
  "contact",
  "campaign",
  "step",
  "attempt",
  "delayMs",
  "messageId",
  "count",
] as const;

export type SendLogAction =
  | "skipped"
  | "sent"
  | "retry"
  | "failed"
  | "bounced"
  | "paused";

export type SendLogFields = {
  reason?: string;
  mailbox?: string;
  enrollment?: string;
  contact?: string;
  campaign?: string;
  step?: string | number;
  attempt?: string | number;
  delayMs?: string | number;
  messageId?: string;
  count?: string | number;
};

/** One structured decision line. Spec §3.5: `[send] skipped reason=outside_window mailbox=…`. */
export function formatSendLog(action: SendLogAction, fields: SendLogFields): string {
  const parts: string[] = [];
  for (const key of FIELD_ORDER) {
    const value = fields[key];
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${key}=${sanitizeLogValue(String(value))}`);
  }
  const tail = parts.length ? ` ${parts.join(" ")}` : "";
  return `[send] ${action}${tail}`;
}

export function sanitizeLogValue(value: string): string {
  return value.replace(/[\r\n\t ]+/g, "_");
}
