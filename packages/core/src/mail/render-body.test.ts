import { describe, expect, it } from "vitest";
import { buildOutgoingEmail } from "./send-message.js";

describe("signature and the Task 03 template hook", () => {
  it("fills the contact variable, the unsubscribe link, and the signature", () => {
    const built = buildOutgoingEmail({
      stepNumber: 1,
      stepSubject: "Quick question",
      previousMessageId: null,
      previousReferences: null,
      previousSubject: null,
      fromAddress: "ada@harbor-dental.test",
      fromName: "Ada",
      toAddress: "jane@harbor-dental.test",
      toName: null,
      bodyText: "Hello {{first_name}} {{unsubscribe_link}}",
      firstName: "Jane",
      bodyHtml: null,
      publicUrl: "https://app.example.test",
      unsubscribeToken: "tok_1",
      messageId: "<msg@harbor-dental.test>",
      signature: "Ada\nHarbor",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.email.text).toContain("Hello Jane");
    expect(built.email.text).not.toContain("{{first_name}}");
    expect(built.email.text).toContain("https://app.example.test/u/tok_1");
    expect(built.email.text.endsWith("Ada\nHarbor")).toBe(true);
  });

  it("refuses a variable that has no value and no fallback", () => {
    const built = buildOutgoingEmail({
      stepNumber: 1,
      stepSubject: "Hi {{company|the practice}}",
      previousMessageId: null,
      previousReferences: null,
      previousSubject: null,
      fromAddress: "ada@harbor-dental.test",
      fromName: "Ada",
      toAddress: "jane@harbor-dental.test",
      toName: null,
      bodyText: "Hello {{first_name}} {{city|there}}",
      bodyHtml: null,
      publicUrl: "https://app.example.test",
      unsubscribeToken: "tok_1",
      messageId: "<msg@harbor-dental.test>",
      firstName: "",
      company: "",
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.reason).toBe("missing_variable");
    expect(built.fields).toEqual(["first_name"]);
  });

  it("fills a fallback in the subject", () => {
    const built = buildOutgoingEmail({
      stepNumber: 1,
      stepSubject: "Hi {{company|the practice}}",
      previousMessageId: null,
      previousReferences: null,
      previousSubject: null,
      fromAddress: "ada@harbor-dental.test",
      fromName: null,
      toAddress: "jane@harbor-dental.test",
      toName: null,
      bodyText: "Hello",
      bodyHtml: null,
      publicUrl: "https://app.example.test",
      unsubscribeToken: "tok_1",
      messageId: "<msg@harbor-dental.test>",
      company: "",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.email.subject).toBe("Hi the practice");
  });
});
