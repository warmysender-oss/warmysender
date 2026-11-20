import { describe, expect, it } from "vitest";
import { buildOutgoingEmail, buildRawMessage } from "./send-message.js";
import { replySubject, threadingHeaders } from "./send-threading.js";

const base = {
  fromAddress: "ada@harbor-dental.test",
  fromName: "Ada",
  toAddress: "jane@harbor-dental.test",
  toName: "Jane",
  bodyText: "Hello\r\n.dot\n{{unsubscribe_link}}",
  bodyHtml: null,
  publicUrl: "https://app.example.test/",
  unsubscribeToken: "tok/1",
  messageId: "step-1",
};

describe("threading headers", () => {
  it("leaves step 1 without In-Reply-To and threads a follow-up", () => {
    const first = buildOutgoingEmail({
      ...base,
      stepNumber: 1,
      stepSubject: "Quick question",
      previousMessageId: null,
      previousReferences: null,
      previousSubject: null,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.email.subject).toBe("Quick question");
    expect(first.email.inReplyTo).toBeNull();
    expect(first.email.references).toBeNull();
    expect(first.email.messageId).toBe("<step-1>");

    const second = buildOutgoingEmail({
      ...base,
      stepNumber: 2,
      stepSubject: null,
      previousMessageId: "step-1@harbor-dental.test",
      previousReferences: "<root@harbor-dental.test>",
      previousSubject: "Re: Quick question",
      messageId: "<step-2@harbor-dental.test>",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.email.subject).toBe("Re: Quick question");
    expect(replySubject("Re: Re: Quick question")).toBe("Re: Quick question");
    expect(second.email.inReplyTo).toBe("<step-1@harbor-dental.test>");
    expect(second.email.references).toBe("<root@harbor-dental.test> <step-1@harbor-dental.test>");
  });

  it("uses a follow-up subject when the step sets its own", () => {
    const custom = buildOutgoingEmail({
      ...base,
      stepNumber: 2,
      stepSubject: "A different subject",
      previousMessageId: "<step-1@harbor-dental.test>",
      previousReferences: null,
      previousSubject: "Quick question",
      messageId: "<step-2@harbor-dental.test>",
    });
    expect(custom.ok).toBe(true);
    if (!custom.ok) return;
    expect(custom.email.subject).toBe("A different subject");
    expect(custom.email.inReplyTo).toBe("<step-1@harbor-dental.test>");
  });

  it("refuses a follow-up that has no previous message id", () => {
    expect(
      threadingHeaders({ stepNumber: 2, previousMessageId: "  ", previousReferences: null }).ok,
    ).toBe(false);
  });

  it("strips header injection from the subject", () => {
    const built = buildOutgoingEmail({
      ...base,
      stepNumber: 1,
      stepSubject: "Hello\r\nBcc: spy@harbor-dental.test",
      previousMessageId: null,
      previousReferences: null,
      previousSubject: null,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.email.subject).toBe("Hello Bcc: spy@harbor-dental.test");
    const raw = buildRawMessage(built.email, new Date("2026-01-15T12:00:00.000Z"));
    expect(raw.split("\r\n").filter((line) => line.toLowerCase().startsWith("bcc:"))).toEqual([]);
  });
});
