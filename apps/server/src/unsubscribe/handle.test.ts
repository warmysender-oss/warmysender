import { describe, expect, it } from "vitest";
import { candidate, mailbox, NOON } from "../../../../packages/core/src/scheduler/fixture.js";
import { planSendTick } from "../../../../packages/core/src/scheduler/plan.js";
import { handleUnsubscribeRequest, isOneClickPost } from "./handle.js";

const contact = {
  contactId: "ctc_1",
  email: "Jane@Harbor-Dental.test",
  status: "active" as const,
};

describe("unsubscribe route", () => {
  it("accepts the one-click POST and the body link GET", () => {
    expect(isOneClickPost("application/x-www-form-urlencoded; charset=UTF-8", "List-Unsubscribe=One-Click")).toBe(true);
    const post = handleUnsubscribeRequest({
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      rawBody: "List-Unsubscribe=One-Click",
      contact,
    });
    expect(post.status).toBe(200);
    expect(post.effect).toMatchObject({
      contactId: "ctc_1",
      contactStatus: "unsubscribed",
      suppressEmail: "jane@harbor-dental.test",
      sequenceStopped: true,
    });

    const get = handleUnsubscribeRequest({
      method: "GET",
      contentType: null,
      rawBody: null,
      contact,
    });
    expect(get.status).toBe(200);
    expect(get.effect?.suppressEmail).toBe("jane@harbor-dental.test");

    const after = planSendTick({
      now: NOON,
      mailboxes: [mailbox()],
      candidates: [candidate({ contactStatus: "unsubscribed" })],
      suppressions: [{ kind: "email", value: post.effect?.suppressEmail ?? "" }],
      inFlightMailboxIds: [],
    });
    expect(after.sends).toHaveLength(0);
    expect(after.skips[0]?.reason).toBe("contact_unsubscribed");
  });

  it("does not unsubscribe a POST that is not one-click", () => {
    const response = handleUnsubscribeRequest({
      method: "POST",
      contentType: "application/json",
      rawBody: "{}",
      contact,
    });
    expect(response.status).toBe(400);
    expect(response.effect).toBeNull();
    const form = handleUnsubscribeRequest({
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      rawBody: "List-Unsubscribe=Something-Else",
      contact,
    });
    expect(form.effect).toBeNull();
  });

  it("is idempotent and rejects an unknown token", () => {
    const again = handleUnsubscribeRequest({
      method: "GET",
      contentType: null,
      rawBody: null,
      contact: { ...contact, status: "unsubscribed" },
    });
    expect(again.status).toBe(200);
    expect(again.effect).toBeNull();
    const missing = handleUnsubscribeRequest({
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      rawBody: "List-Unsubscribe=One-Click",
      contact: null,
    });
    expect(missing.status).toBe(404);
    expect(missing.effect).toBeNull();
  });
});
