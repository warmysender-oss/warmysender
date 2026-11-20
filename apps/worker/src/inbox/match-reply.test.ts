import { describe, expect, it } from "vitest";
import { matchReply } from "./match-reply.js";
import type { InboundMail, SentMessageRef } from "./types.js";

const step1: SentMessageRef = {
  messageId: "<campaign-step1@harbor-dental.test>",
  contactId: "contact-jane",
  contactEmail: "jane@river-clinic.test",
  enrollmentId: "enr-jane",
  campaignId: "camp-1",
  stepId: "step-1",
  mailboxId: "mb-1",
  subject: "Intro",
  sentAt: "2026-11-20T11:00:00.000Z",
};

const step2: SentMessageRef = {
  ...step1,
  messageId: "<campaign-step2@harbor-dental.test>",
  stepId: "step-2",
  sentAt: "2026-11-22T11:00:00.000Z",
};

const sam: SentMessageRef = {
  ...step1,
  messageId: "<sam-step@harbor-dental.test>",
  contactId: "contact-sam",
  contactEmail: "sam@northwind.test",
  enrollmentId: "enr-sam",
  sentAt: "2026-11-21T11:00:00.000Z",
};

function inbound(partial: Partial<InboundMail> & Pick<InboundMail, "from" | "subject">): Pick<InboundMail, "from" | "subject" | "inReplyTo" | "references"> {
  return {
    inReplyTo: null,
    references: null,
    ...partial,
  };
}

describe("matchReply", () => {
  const sent = [step1, step2, sam];

  it("prefers In-Reply-To over a newer sender+subject candidate", () => {
    const match = matchReply(
      inbound({
        from: "Jane Smith <jane@river-clinic.test>",
        subject: "Re: Intro",
        inReplyTo: "<Campaign-Step1@Harbor-Dental.test>",
      }),
      sent,
    );
    expect(match?.method).toBe("in_reply_to");
    expect(match?.sent.stepId).toBe("step-1");
  });

  it("uses the closest References id when In-Reply-To is unknown", () => {
    const match = matchReply(
      inbound({
        from: "Jane <jane@river-clinic.test>",
        subject: "Re: Intro",
        inReplyTo: "<not-ours@elsewhere.test>",
        references: "<campaign-step1@harbor-dental.test> <not-ours@elsewhere.test>",
      }),
      sent,
    );
    expect(match?.method).toBe("references");
    expect(match?.sent.messageId).toBe(step1.messageId);
  });

  it("falls back to sender plus subject and picks the latest send", () => {
    const match = matchReply(
      inbound({ from: "jane@river-clinic.test", subject: "Fwd: Intro" }),
      sent,
    );
    expect(match?.method).toBe("sender_subject");
    expect(match?.sent.stepId).toBe("step-2");
  });

  it("does not match a different sender with the same subject", () => {
    const match = matchReply(inbound({ from: "sam@northwind.test", subject: "Re: Something else" }), sent);
    expect(match).toBeNull();
  });

  it("does not match the right sender with a different subject", () => {
    const match = matchReply(inbound({ from: "jane@river-clinic.test", subject: "Re: Other" }), sent);
    expect(match).toBeNull();
  });
});
