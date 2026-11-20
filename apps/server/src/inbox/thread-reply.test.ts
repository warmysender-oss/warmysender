import { describe, expect, it } from "vitest";
import { applyInterest } from "./interest.js";
import { buildThreadReply, buildThreads, replySubject, type ThreadMessage } from "./thread-reply.js";

function message(partial: Partial<ThreadMessage> & Pick<ThreadMessage, "id" | "at" | "kind">): ThreadMessage {
  return {
    mailboxId: "mb-1",
    contactId: "contact-jane",
    direction: partial.kind === "sent" ? "out" : "in",
    subject: "Re: Intro",
    from: "jane@river-clinic.test",
    bodyText: "Hello",
    messageId: `<${partial.id}@river-clinic.test>`,
    interest: null,
    ...partial,
  };
}

describe("buildThreads", () => {
  it("groups a contact on one mailbox and keeps chronological order", () => {
    const threads = buildThreads([
      message({ id: "b", at: "2026-11-20T13:00:00.000Z", kind: "reply", subject: "Re: Intro" }),
      message({ id: "a", at: "2026-11-20T11:00:00.000Z", kind: "sent", subject: "Intro", direction: "out" }),
      message({ id: "c", at: "2026-11-20T12:00:00.000Z", kind: "reply", mailboxId: "mb-2", subject: "Other" }),
    ]);
    expect(threads).toHaveLength(2);
    expect(threads[0]?.key).toBe("mb-1:contact-jane");
    expect(threads[0]?.messages.map((item) => item.id)).toEqual(["a", "b"]);
    expect(threads[0]?.badge).toBe("reply");
    expect(threads[1]?.mailboxId).toBe("mb-2");
  });

  it("labels an auto-reply thread and keeps an unmatched message alone", () => {
    const threads = buildThreads([
      message({ id: "ooo", at: "2026-11-20T13:00:00.000Z", kind: "auto_reply" }),
      message({ id: "loose", at: "2026-11-20T14:00:00.000Z", kind: "unmatched", contactId: null }),
    ]);
    expect(threads.find((thread) => thread.contactId === "contact-jane")?.badge).toBe("auto-reply");
    expect(threads.find((thread) => thread.key === "lone:loose")?.badge).toBe("unmatched");
  });

  it("shows interest from the latest real reply", () => {
    const threads = buildThreads([
      message({ id: "old", at: "2026-11-20T12:00:00.000Z", kind: "reply", interest: "interested" }),
      message({ id: "new", at: "2026-11-20T13:00:00.000Z", kind: "reply", interest: "not_interested" }),
    ]);
    expect(threads[0]?.interest).toBe("not_interested");
  });
});

describe("buildThreadReply", () => {
  it("replies in the same thread from the same mailbox", () => {
    const draft = buildThreadReply({
      mailboxId: "mb-1",
      mailboxEmail: "alex@harbor-dental.test",
      contactEmail: "jane@river-clinic.test",
      messages: [
        { messageId: "<campaign-step1@harbor-dental.test>", subject: "Intro", at: "2026-11-20T11:00:00.000Z", direction: "out" },
        { messageId: "<reply-1@river-clinic.test>", subject: "Re: Intro", at: "2026-11-20T13:00:00.000Z", direction: "in" },
      ],
      bodyText: " Tuesday works. ",
    });
    expect(draft.mailboxId).toBe("mb-1");
    expect(draft.from).toBe("alex@harbor-dental.test");
    expect(draft.to).toBe("jane@river-clinic.test");
    expect(draft.subject).toBe("Re: Intro");
    expect(draft.inReplyTo).toBe("<reply-1@river-clinic.test>");
    expect(draft.references).toBe("<campaign-step1@harbor-dental.test> <reply-1@river-clinic.test>");
    expect(draft.bodyText).toBe("Tuesday works.");
  });

  it("adds a single Re: prefix", () => {
    expect(replySubject("Intro")).toBe("Re: Intro");
    expect(replySubject("RE: Intro")).toBe("RE: Intro");
  });

  it("rejects an empty body and a thread with no Message-ID", () => {
    expect(() =>
      buildThreadReply({
        mailboxId: "mb-1",
        mailboxEmail: "alex@harbor-dental.test",
        contactEmail: "jane@river-clinic.test",
        messages: [{ messageId: "<a@harbor-dental.test>", subject: "Intro", at: "2026-11-20T11:00:00.000Z", direction: "out" }],
        bodyText: "  ",
      }),
    ).toThrow(/empty/);
    expect(() =>
      buildThreadReply({
        mailboxId: "mb-1",
        mailboxEmail: "alex@harbor-dental.test",
        contactEmail: "jane@river-clinic.test",
        messages: [{ messageId: null, subject: "Intro", at: "2026-11-20T11:00:00.000Z", direction: "out" }],
        bodyText: "Hello",
      }),
    ).toThrow(/Message-ID/);
  });
});

describe("applyInterest", () => {
  it("allows interested and not interested on a real reply", () => {
    expect(applyInterest("reply", "interested")).toBe("interested");
    expect(applyInterest("reply", "not_interested")).toBe("not_interested");
  });

  it("rejects auto-replies and bounces", () => {
    expect(() => applyInterest("auto_reply", "interested")).toThrow(/real reply/);
    expect(() => applyInterest("bounce", "not_interested")).toThrow(/real reply/);
  });
});
