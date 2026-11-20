import nodemailer from "nodemailer";
import { decryptString, type Config } from "@warmysender/core";
import type { ThreadReply } from "./thread-reply.js";

export interface ReplyMailbox {
  email: string;
  fromName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: string;
  smtpUsername: string;
  smtpPasswordEncrypted: string | null;
  oauthAccessTokenEncrypted: string | null;
  oauthAccessTokenExpiresAt: Date | null;
}

export interface ReplyTransportInput {
  mailbox: ReplyMailbox;
  draft: ThreadReply;
}

export type ReplyTransport = (input: ReplyTransportInput) => Promise<{ messageId: string }>;

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function nodemailerTransport(config: Config): ReplyTransport {
  return async ({ mailbox, draft }) => {
    const tokenExpired =
      mailbox.oauthAccessTokenExpiresAt !== null && mailbox.oauthAccessTokenExpiresAt.getTime() <= Date.now();
    const accessToken =
      mailbox.oauthAccessTokenEncrypted && !tokenExpired
        ? decryptString(mailbox.oauthAccessTokenEncrypted, config.encryptionKey)
        : null;
    const password = mailbox.smtpPasswordEncrypted
      ? decryptString(mailbox.smtpPasswordEncrypted, config.encryptionKey)
      : null;
    if (!accessToken && !password) {
      throw new Error("Reconnect this mailbox before replying.");
    }
    const user = mailbox.smtpUsername || mailbox.email;
    const transport = nodemailer.createTransport({
      host: mailbox.smtpHost,
      port: mailbox.smtpPort,
      secure: mailbox.smtpSecurity === "ssl",
      requireTLS: mailbox.smtpSecurity === "starttls",
      auth: accessToken ? { type: "OAuth2", user, accessToken } : { user, pass: password ?? "" },
    });
    const fromName = cleanHeader(mailbox.fromName);
    const info = await transport.sendMail({
      from: fromName ? `"${fromName.replace(/"/g, "")}" <${mailbox.email}>` : mailbox.email,
      to: draft.to,
      subject: cleanHeader(draft.subject),
      text: draft.bodyText,
      inReplyTo: draft.inReplyTo,
      references: draft.references,
    });
    return { messageId: info.messageId };
  };
}
