import { describe, expect, it } from "vitest";
import { applyUnsubscribeLink, unsubscribeHeaders, unsubscribeUrl } from "./send-headers.js";
import { buildOutgoingEmail, buildRawMessage } from "./send-message.js";

describe("List-Unsubscribe", () => {
  it("builds a mailto-free https header and encodes the token", () => {
    expect(unsubscribeUrl("https://app.example.test/", "a b")).toBe("https://app.example.test/u/a%20b");
    const headers = unsubscribeHeaders("https://app.example.test", "tok_1");
    expect(headers).toEqual({
      listUnsubscribe: "<https://app.example.test/u/tok_1>",
      listUnsubscribePost: "List-Unsubscribe=One-Click",
    });
    expect(JSON.stringify(headers).toLowerCase()).not.toContain("mailto:");
    expect(unsubscribeHeaders("mailto:ada@harbor-dental.test", "tok_1")).toBeNull();
    expect(unsubscribeHeaders("https://user:pass@app.example.test", "tok_1")).toBeNull();
    expect(unsubscribeUrl("http://localhost:3000", "tok_1")).toBe("http://localhost:3000/u/tok_1");
  });

  it("replaces the placeholder and leaves a body that removed it", () => {
    const url = "https://app.example.test/u/tok_1";
    expect(applyUnsubscribeLink("Bye {{unsubscribe_link|this link}}", url)).toBe(`Bye ${url}`);
    expect(applyUnsubscribeLink("No link here", url)).toBe("No link here");
  });

  it("writes both headers on the raw message", () => {
    const built = buildOutgoingEmail({
      stepNumber: 1,
      stepSubject: "Hello",
      previousMessageId: null,
      previousReferences: null,
      previousSubject: null,
      fromAddress: "ada@harbor-dental.test",
      fromName: null,
      toAddress: "jane@harbor-dental.test",
      toName: null,
      bodyText: "Hi {{unsubscribe_link}}",
      bodyHtml: "<p>Hi {{unsubscribe_link}}</p>",
      publicUrl: "https://app.example.test",
      unsubscribeToken: "tok_1",
      messageId: "<abc@harbor-dental.test>",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const raw = buildRawMessage(built.email, new Date("2026-01-15T12:00:00.000Z"));
    expect(raw).toContain("List-Unsubscribe: <https://app.example.test/u/tok_1>");
    expect(raw).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(raw.toLowerCase()).not.toContain("mailto:");
    expect(raw).toContain("https://app.example.test/u/tok_1");
  });
});
