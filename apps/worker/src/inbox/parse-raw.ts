import { decodeBody, decodeHeaderWords, extractMessageIds } from "./codec.js";
import type { DeliveryRecipient, InboundMail } from "./types.js";

interface HeaderMap {
  get(name: string): string | null;
  all(name: string): string[];
}

function parseHeaderMap(headerText: string): HeaderMap {
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, " ");
  const entries = new Map<string, string[]>();
  for (const line of unfolded.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = decodeHeaderWords(line.slice(colon + 1).trim());
    const list = entries.get(name) ?? [];
    list.push(value);
    entries.set(name, list);
  }
  return {
    get(name: string) {
      const values = entries.get(name.toLowerCase());
      if (!values || values.length === 0) return null;
      return values.join(" ");
    },
    all(name: string) {
      return entries.get(name.toLowerCase()) ?? [];
    },
  };
}

function splitHeadersAndBody(raw: string): { headerText: string; body: string } {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const splitAt = normalized.indexOf("\n\n");
  if (splitAt === -1) return { headerText: normalized, body: "" };
  return { headerText: normalized.slice(0, splitAt), body: normalized.slice(splitAt + 2) };
}

export interface ContentType {
  mediaType: string;
  params: Record<string, string>;
}

export function parseContentType(value: string | null): ContentType {
  if (!value) return { mediaType: "text/plain", params: {} };
  const segments: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of value) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }
    if (char === ";" && !inQuotes) {
      segments.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) segments.push(current);
  const mediaType = (segments[0] ?? "text/plain").trim().toLowerCase();
  const params: Record<string, string> = {};
  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf("=");
    if (eq === -1) continue;
    const key = segment.slice(0, eq).trim().toLowerCase();
    let param = segment.slice(eq + 1).trim();
    if (param.startsWith('"') && param.endsWith('"') && param.length >= 2) {
      param = param.slice(1, -1);
    }
    if (key) params[key] = param;
  }
  return { mediaType, params };
}

function splitMultipart(body: string, boundary: string): string[] {
  const delimiter = `--${boundary}`;
  const closing = `--${boundary}--`;
  const parts: string[] = [];
  let current: string[] | null = null;
  for (const line of body.split("\n")) {
    const marker = line.trimEnd();
    if (marker === delimiter || marker === closing) {
      if (current) parts.push(current.join("\n").replace(/^\n/, ""));
      current = marker === closing ? null : [];
      if (marker === closing) break;
      continue;
    }
    if (current) current.push(line);
  }
  return parts;
}

interface Collected {
  texts: string[];
  delivery: string[];
  originals: string[];
}

function collect(body: string, contentTypeHeader: string | null, transferEncoding: string | null, depth: number, into: Collected): void {
  const contentType = parseContentType(contentTypeHeader);
  if (contentType.mediaType.startsWith("multipart/") && contentType.params.boundary && depth < 4) {
    for (const part of splitMultipart(body, contentType.params.boundary)) {
      const split = splitHeadersAndBody(part);
      const headers = parseHeaderMap(split.headerText);
      collect(split.body, headers.get("content-type"), headers.get("content-transfer-encoding"), depth + 1, into);
    }
    return;
  }
  const decoded = decodeBody(body, transferEncoding).replace(/\n$/, "");
  if (contentType.mediaType === "message/delivery-status") {
    into.delivery.push(decoded);
    return;
  }
  if (contentType.mediaType === "message/rfc822" || contentType.mediaType === "text/rfc822-headers") {
    into.originals.push(decoded);
    return;
  }
  if (contentType.mediaType.startsWith("text/plain") || depth === 0) {
    into.texts.push(decoded);
  }
}

function deliveryRecipients(blocks: string[]): DeliveryRecipient[] {
  const recipients: DeliveryRecipient[] = [];
  for (const blockText of blocks) {
    const chunks = blockText.split(/\n\s*\n/);
    for (const chunk of chunks) {
      const fields = parseHeaderMap(chunk);
      const finalRecipient = fields.get("final-recipient");
      const originalRecipient = fields.get("original-recipient");
      const action = fields.get("action");
      const status = fields.get("status");
      const diagnosticCode = fields.get("diagnostic-code");
      if (!finalRecipient && !originalRecipient && !action && !status) continue;
      recipients.push({
        finalRecipient,
        originalRecipient,
        action,
        status,
        diagnosticCode,
      });
    }
  }
  return recipients;
}

export function parseRawEmail(raw: string): InboundMail {
  const split = splitHeadersAndBody(raw);
  const headers = parseHeaderMap(split.headerText);
  const collected: Collected = { texts: [], delivery: [], originals: [] };
  collect(split.body, headers.get("content-type"), headers.get("content-transfer-encoding"), 0, collected);
  const headerRecord: Record<string, string> = {};
  for (const name of [
    "from",
    "to",
    "subject",
    "message-id",
    "in-reply-to",
    "references",
    "auto-submitted",
    "x-autoreply",
    "x-autorespond",
    "content-type",
    "date",
  ]) {
    const value = headers.get(name);
    if (value !== null) headerRecord[name] = value;
  }
  const contentType = parseContentType(headers.get("content-type"));
  const originalMessageIds = collected.originals.flatMap((original) => {
    const inner = parseHeaderMap(splitHeadersAndBody(original).headerText);
    return extractMessageIds(inner.get("message-id"));
  });
  return {
    from: headers.get("from") ?? "",
    to: headers.get("to"),
    subject: headers.get("subject") ?? "",
    messageId: headers.get("message-id"),
    inReplyTo: headers.get("in-reply-to"),
    references: headers.get("references"),
    headers: headerRecord,
    contentType: contentType.mediaType,
    text: collected.texts.join("\n").trim(),
    recipients: deliveryRecipients(collected.delivery),
    originalMessageIds,
  };
}
