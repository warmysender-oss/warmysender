import { applyInterest, type Interest } from "./interest.js";
import { buildThreadReply, buildThreads, type Thread, type ThreadMessage, type ThreadReply } from "./thread-reply.js";

export interface InboxMailbox {
  id: string;
  email: string;
}

export interface InboxContact {
  id: string;
  email: string;
}

export interface InboxReader {
  listMessages(): Promise<ThreadMessage[]>;
  getMessage(id: string): Promise<ThreadMessage | null>;
  setInterest(id: string, interest: Interest): Promise<void>;
  mailbox(id: string): Promise<InboxMailbox | null>;
  contact(id: string): Promise<InboxContact | null>;
}

export interface MailSender {
  send(draft: ThreadReply): Promise<{ messageId: string }>;
}

export class InboxService {
  constructor(
    private readonly reader: InboxReader,
    private readonly sender: MailSender,
  ) {}

  async listThreads(): Promise<Thread[]> {
    return buildThreads(await this.reader.listMessages());
  }

  async getThread(key: string): Promise<Thread | null> {
    const threads = await this.listThreads();
    return threads.find((thread) => thread.key === key) ?? null;
  }

  async markInterest(messageId: string, interest: Interest): Promise<void> {
    const message = await this.reader.getMessage(messageId);
    if (!message) throw new Error("Message not found");
    applyInterest(message.kind, interest);
    await this.reader.setInterest(messageId, interest);
  }

  /** Sends from the mailbox that already owns the thread. */
  async reply(threadKey: string, bodyText: string): Promise<ThreadReply & { messageId: string }> {
    const thread = await this.getThread(threadKey);
    if (!thread) throw new Error("Thread not found");
    if (!thread.contactId) throw new Error("Thread has no contact");
    const mailbox = await this.reader.mailbox(thread.mailboxId);
    const contact = await this.reader.contact(thread.contactId);
    if (!mailbox) throw new Error("Mailbox not found");
    if (!contact) throw new Error("Contact not found");
    const draft = buildThreadReply({
      mailboxId: mailbox.id,
      mailboxEmail: mailbox.email,
      contactEmail: contact.email,
      messages: thread.messages,
      bodyText,
    });
    const sent = await this.sender.send(draft);
    return { ...draft, messageId: sent.messageId };
  }
}
