import { applyRecipientEvent } from "../../../../packages/core/src/scheduler/recipient-events.js";
import type { ContactStatus } from "../../../../packages/core/src/scheduler/types.js";

export type UnsubscribeContact = {
  contactId: string;
  email: string;
  status: ContactStatus;
};

export type UnsubscribeEffect = {
  contactId: string;
  email: string;
  contactStatus: "unsubscribed";
  suppressEmail: string;
  sequenceStopped: true;
};

export type UnsubscribeResponse = {
  status: number;
  contentType: string;
  body: string;
  effect: UnsubscribeEffect | null;
};

/**
 * `GET /u/:token` is the link in the body.
 * `POST` with `List-Unsubscribe=One-Click` is the one-click header (RFC 8058).
 * Any other POST does not change state, so a prefetch cannot unsubscribe.
 */
export function handleUnsubscribeRequest(input: {
  method: string;
  contentType: string | null;
  rawBody: string | null;
  contact: UnsubscribeContact | null;
}): UnsubscribeResponse {
  const method = input.method.toUpperCase();
  if (!input.contact) {
    return {
      status: 404,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ ok: false, error: "invalid_token" }),
      effect: null,
    };
  }

  if (method === "POST") {
    if (!isOneClickPost(input.contentType, input.rawBody)) {
      return {
        status: 400,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ ok: false, error: "invalid_one_click" }),
        effect: null,
      };
    }
    return finish(input.contact);
  }

  if (method === "GET") return finish(input.contact);

  return {
    status: 405,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    effect: null,
  };
}

export function isOneClickPost(contentType: string | null, rawBody: string | null): boolean {
  if (!contentType || !contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
    return false;
  }
  const params = new URLSearchParams(rawBody ?? "");
  return params.get("List-Unsubscribe") === "One-Click";
}

function finish(contact: UnsubscribeContact): UnsubscribeResponse {
  if (contact.status === "unsubscribed") {
    return {
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: page("This address is already unsubscribed."),
      effect: null,
    };
  }
  const applied = applyRecipientEvent({
    kind: "unsubscribe",
    contactStatus: contact.status,
    email: contact.email,
    enrollments: [],
  });
  return {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: page("You are unsubscribed. We will not email this address again."),
    effect: {
      contactId: contact.contactId,
      email: contact.email,
      contactStatus: "unsubscribed",
      suppressEmail: applied.suppressEmail ?? contact.email.trim().toLowerCase(),
      sequenceStopped: true,
    },
  };
}

function page(message: string): string {
  const safe = message.replace(/[&<>]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    return "&gt;";
  });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head><body><p>${safe}</p></body></html>`;
}
