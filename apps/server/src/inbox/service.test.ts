import { describe, expect, it } from "vitest";
import type { Interest } from "./interest.js";
import { InboxService, type InboxContact, type InboxMailbox, type InboxReader, type MailSender } from "./service.js";
import type { ThreadMessage, ThreadReply } from "./thread-reply.js";

function message(partial: Partial<ThreadMessage> & Pick<ThreadMessage, "id" | "kind">): ThreadMessage {
  return {
    mailboxId: "mb-1",
    contactId: "contact-jane",
    at: "2026-11-20T13:00:00.000Z",
    direction: "in",
    subject: "Re: Intro",
    from: "jane@river-clinic.test",
    bodyText: "Thanks",
    messageId: "<reply-1@river-clinic.test>",
    interest: null,
    ...partial,
  };
}

function reader(messages: ThreadMessage[]): InboxReader & { interest: Array<{ id: string; interest: Interest }> } {
  const interest: Array<{ id: string; interest: Interest }> = [];
  const mailboxes = new Map<string, InboxMailbox>([["mb-1", { id: "mb-1", email: "alex@harbor-dental.test" }]]);
  const contacts = new Map<string, InboxContact>([["contact-jane", { id: "contact-jane", email: "jane@river-clinic.test" }]]);
  return {
    interest,
    async listMessages() {
      return messages;
    },
    async getMessage(id: string) {
      return messages.find((item) => item.id === id) ?? null;
    },
    async setInterest(id: string, value: Interest) {
      interest.push({ id, interest: value });
    },
    async mailbox(id: string) {
      return mailboxes.get(id) ?? null;
    },
    async contact(id: string) {
      return contacts.get(id) ?? null;
    },
  };
}

describe("InboxService", () => {
  it("marks a real reply interested", async () => {
    const store = reader([message({ id: "reply-1", kind: "reply" })]);
    const service = new InboxService(store, { async send() { throw new Error("not used"); } });
    await service.markInterest("reply-1", "interested");
    expect(store.interest).toEqual([{ id: "reply-1", interest: "interested" }]);
  });

  it("does not store interest on an auto-reply", async () => {
    const store = reader([message({ id: "ooo", kind: "auto_reply" })]);
    const service = new InboxService(store, { async send() { throw new Error("not used"); } });
    await expect(service.markInterest("ooo", "interested")).rejects.toThrow(/real reply/);
    expect(store.interest).toEqual([]);
  });

  it("replies from the mailbox that owns the thread", async () => {
    const sent: ThreadReply[] = [];
    const sender: MailSender = {
      async send(draft) {
        sent.push(draft);
        return { messageId: "<out-1@harbor-dental.test>" };
      },
    };
    const service = new InboxService(
      reader([
        message({
          id: "sent-1",
          kind: "sent",
          direction: "out",
          at: "2026-11-20T11:00:00.000Z",
          subject: "Intro",
          messageId: "<campaign-step1@harbor-dental.test>",
        }),
        message({ id: "reply-1", kind: "reply" }),
      ]),
      sender,
    );
    const result = await service.reply("mb-1:contact-jane", "Tuesday works.");
    expect(sent).toHaveLength(1);
    expect(result.mailboxId).toBe("mb-1");
    expect(result.from).toBe("alex@harbor-dental.test");
    expect(result.to).toBe("jane@river-clinic.test");
    expect(result.inReplyTo).toBe("<reply-1@river-clinic.test>");
    expect(result.subject).toBe("Re: Intro");
    expect(result.messageId).toBe("<out-1@harbor-dental.test>");
  });
});
