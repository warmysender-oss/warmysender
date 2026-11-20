import { renderTemplate } from "../campaigns/template.js";
import { appendSignature, missingRequiredVariables, templateContact } from "./render-body.js";
import { unsubscribeHeaders, unsubscribeUrl } from "./send-headers.js";
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
  signature?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
  customFields?: Readonly<Record<string, string | null | undefined>> | null;
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
):
  | { ok: true; email: OutgoingEmail }
  | { ok: false; reason: "missing_subject" | "missing_thread" | "invalid_unsubscribe_url" | "missing_variable"; fields?: string[] } {
  const thread = threadingHeaders(input);
  if (!thread.ok) return thread;
  const headers = unsubscribeHeaders(input.publicUrl, input.unsubscribeToken);
  const url = unsubscribeUrl(input.publicUrl, input.unsubscribeToken);
  if (!headers || !url) return { ok: false, reason: "invalid_unsubscribe_url" };
  const contact = templateContact({ ...input, unsubscribeLink: url });
  const missing = [
    ...missingRequiredVariables(input.stepSubject ?? "", contact),
    ...missingRequiredVariables(input.bodyText, contact),
    ...missingRequiredVariables(input.bodyHtml ?? "", contact),
  ];
  const fields = [...new Set(missing)];
  if (fields.length > 0) return { ok: false, reason: "missing_variable", fields };
  const renderedSubject = input.stepSubject ? renderTemplate(input.stepSubject, contact) : input.stepSubject;
  const renderedText = renderTemplate(input.bodyText, contact);
  const renderedHtml = input.bodyHtml ? renderTemplate(input.bodyHtml, contact, { escapeValues: true }) : null;
  const signature = input.signature ?? "";
  const text = appendSignature(renderedText, signature, false);
  const html = renderedHtml ? appendSignature(renderedHtml, signature, true) : null;
  const subject = resolveSubject({ ...input, stepSubject: renderedSubject });
  if (!subject.ok) return subject;
  return {
    ok: true,
    email: {
      from: formatAddress(input.fromName, input.fromAddress),
      to: formatAddress(input.toName, input.toAddress),
      subject: subject.subject,
      messageId: normalizeMessageId(input.messageId),
      text,
      html,
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
