import { applyUnsubscribeLink, unsubscribeHeaders, unsubscribeUrl } from "./send-headers.js";
import {
  normalizeMessageId,
  resolveSubject,
  sanitizeHeader,
  threadingHeaders,
} from "./send-threading.js";

export type OutgoingEmail = {
  from: string;
  to: string;
  subject: string;
  messageId: string;
  text: string;
  html: string | null;
  inReplyTo: string | null;
  references: string | null;
  listUnsubscribe: string;
  listUnsubscribePost: string;
};

export type SendContent = {
  stepNumber: number;
  stepSubject: string | null;
  previousMessageId: string | null;
  previousReferences: string | null;
  previousSubject: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  toName: string | null;
  bodyText: string;
  bodyHtml: string | null;
  publicUrl: string;
  unsubscribeToken: string;
  messageId: string;
};

export function formatAddress(name: string | null, address: string): string {
  const addr = sanitizeHeader(address);
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return addr;
  const safe = sanitizeHeader(trimmed).replace(/"/g, "");
  return `"${safe}" <${addr}>`;
}

export function createMessageId(fromAddress: string, unique: string): string {
  const domain = sanitizeHeader(fromAddress).split("@")[1] || "localhost";
  const local = unique.replace(/[^A-Za-z0-9._-]/g, "") || "msg";
  return `<${local}@${domain}>`;
}

export function buildOutgoingEmail(
  input: SendContent,
): { ok: true; email: OutgoingEmail } | { ok: false; reason: "missing_subject" | "missing_thread" | "invalid_unsubscribe_url" } {
  const subject = resolveSubject(input);
  if (!subject.ok) return subject;
  const thread = threadingHeaders(input);
  if (!thread.ok) return thread;
  const headers = unsubscribeHeaders(input.publicUrl, input.unsubscribeToken);
  const url = unsubscribeUrl(input.publicUrl, input.unsubscribeToken);
  if (!headers || !url) return { ok: false, reason: "invalid_unsubscribe_url" };
  return {
    ok: true,
    email: {
      from: formatAddress(input.fromName, input.fromAddress),
      to: formatAddress(input.toName, input.toAddress),
      subject: subject.subject,
      messageId: normalizeMessageId(input.messageId),
      text: applyUnsubscribeLink(input.bodyText, url),
      html: input.bodyHtml ? applyUnsubscribeLink(input.bodyHtml, url) : null,
      inReplyTo: thread.inReplyTo ?? null,
      references: thread.references ?? null,
      listUnsubscribe: headers.listUnsubscribe,
      listUnsubscribePost: headers.listUnsubscribePost,
    },
  };
}

/** CRLF RFC 5322 message. Body lines that start with "." are dot-stuffed for SMTP DATA. */
export function buildRawMessage(email: OutgoingEmail, date: Date): string {
  const headers = [
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Subject: ${email.subject}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: ${email.messageId}`,
    "MIME-Version: 1.0",
    `List-Unsubscribe: ${email.listUnsubscribe}`,
    `List-Unsubscribe-Post: ${email.listUnsubscribePost}`,
  ];
  if (email.inReplyTo) headers.push(`In-Reply-To: ${email.inReplyTo}`);
  if (email.references) headers.push(`References: ${email.references}`);

  let body: string;
  if (!email.html) {
    headers.push("Content-Type: text/plain; charset=utf-8");
    headers.push("Content-Transfer-Encoding: 8bit");
    body = email.text;
  } else {
    const boundary = `warmysender_${email.messageId.replace(/[^A-Za-z0-9]/g, "").slice(0, 24)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      email.text,
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      email.html,
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }

  const head = headers.join("\r\n");
  const stuffed = dotStuff(`${head}\r\n\r\n${body}`);
  return stuffed.endsWith("\r\n") ? stuffed : `${stuffed}\r\n`;
}

function dotStuff(raw: string): string {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized
    .split("\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}
