import { eq } from "drizzle-orm";
import nodemailer, { type SMTPTransportOptions } from "nodemailer";
import { decryptString, mailboxes, type AppDatabase, type SendFailure, type SmtpTransport } from "@warmysender/core";

/**
 * SMTP (and XOAUTH2 when an unexpired access token is already stored).
 * Refreshing a Microsoft token is the mailbox task; a missing token is an auth failure,
 * which pauses the mailbox after three tries instead of looping.
 */
export function createSmtpTransport(db: AppDatabase, encryptionKey: Buffer): SmtpTransport {
  return {
    async send(email, mailboxId) {
      const rows = await db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId)).limit(1);
      const mailbox = rows[0];
      if (!mailbox) return { ok: false, failure: { message: "mailbox not found", authFailed: true } };
      try {
        const transport = nodemailer.createTransport(transportOptions(mailbox, encryptionKey));
        const sent = await transport.sendMail({
          from: email.from,
          to: email.to,
          subject: email.subject,
          text: email.text,
          html: email.html ?? undefined,
          messageId: email.messageId,
          inReplyTo: email.inReplyTo ?? undefined,
          references: email.references ?? undefined,
          headers: {
            "List-Unsubscribe": email.listUnsubscribe,
            "List-Unsubscribe-Post": email.listUnsubscribePost,
          },
        });
        const messageId = typeof sent.messageId === "string" ? sent.messageId : email.messageId;
        return { ok: true, messageId };
      } catch (error) {
        return { ok: false, failure: toFailure(error) };
      }
    },
  };
}

function transportOptions(
  mailbox: {
    email: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecurity: string;
    smtpUsername: string;
    smtpPasswordEncrypted: string | null;
    oauthAccessTokenEncrypted: string | null;
    oauthAccessTokenExpiresAt: Date | null;
  },
  encryptionKey: Buffer,
): SMTPTransportOptions {
  const accessToken = decryptOptional(mailbox.oauthAccessTokenEncrypted, encryptionKey);
  const tokenFresh =
    Boolean(accessToken) &&
    mailbox.oauthAccessTokenExpiresAt !== null &&
    mailbox.oauthAccessTokenExpiresAt.getTime() > Date.now() + 60_000;
  const password = decryptOptional(mailbox.smtpPasswordEncrypted, encryptionKey);
  return {
    host: mailbox.smtpHost,
    port: mailbox.smtpPort,
    secure: mailbox.smtpSecurity === "ssl",
    requireTLS: mailbox.smtpSecurity === "starttls",
    ignoreTLS: mailbox.smtpSecurity === "none",
    auth: tokenFresh
      ? { type: "OAuth2", user: mailbox.email, accessToken: accessToken ?? "" }
      : password
        ? { user: mailbox.smtpUsername || mailbox.email, pass: password }
        : undefined,
  };
}

function decryptOptional(value: string | null, key: Buffer): string | null {
  if (!value) return null;
  try {
    return decryptString(value, key);
  } catch {
    return null;
  }
}

function toFailure(error: unknown): SendFailure {
  if (!(error instanceof Error)) return { message: "send failed" };
  const extra = error as Error & { responseCode?: number; response?: string; code?: string };
  const code = extra.code ?? "";
  return {
    responseCode: typeof extra.responseCode === "number" ? extra.responseCode : null,
    message: extra.response || error.message,
    timedOut: code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNECTION",
    authFailed: code === "EAUTH" || extra.responseCode === 535 || extra.responseCode === 534,
  };
}
