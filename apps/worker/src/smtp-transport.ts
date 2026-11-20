import { eq } from "drizzle-orm";
import nodemailer, { type SMTPTransportOptions } from "nodemailer";
import {
  decryptString,
  encryptString,
  mailboxes,
  refreshMicrosoftSecrets,
  type AppDatabase,
  type MicrosoftTokenEnv,
  type SendFailure,
  type SmtpTransport,
  type TokenRequest,
} from "@warmysender/core";

export type SmtpTransportDeps = {
  db: AppDatabase;
  encryptionKey: Buffer;
  microsoft: MicrosoftTokenEnv;
  now?: () => Date;
  fetchToken?: (request: TokenRequest) => Promise<unknown>;
  deliver?: (options: SMTPTransportOptions, email: Parameters<SmtpTransport["send"]>[0]) => Promise<{ messageId?: string }>;
};

/**
 * SMTP password, or XOAUTH2 for a Microsoft mailbox.
 * An expired access token is refreshed before the send. That refresh is not an auth failure.
 * A refresh that Microsoft refuses is an auth failure.
 */
export function createSmtpTransport(deps: SmtpTransportDeps): SmtpTransport {
  const now = deps.now ?? (() => new Date());
  const fetchToken = deps.fetchToken ?? defaultFetchToken;
  const deliver = deps.deliver ?? deliverWithNodemailer;
  return {
    async send(email, mailboxId) {
      const rows = await deps.db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId)).limit(1);
      const mailbox = rows[0];
      if (!mailbox) return { ok: false, failure: { message: "mailbox not found", authFailed: true } };
      const auth = await resolveAuth(deps, mailbox, now(), fetchToken);
      if (!auth.ok) return { ok: false, failure: auth.failure };
      try {
        const sent = await deliver(
          {
            host: mailbox.smtpHost,
            port: mailbox.smtpPort,
            secure: mailbox.smtpSecurity === "ssl",
            requireTLS: mailbox.smtpSecurity === "starttls",
            ignoreTLS: mailbox.smtpSecurity === "none",
            auth: auth.auth,
          },
          email,
        );
        const messageId = typeof sent.messageId === "string" ? sent.messageId : email.messageId;
        return { ok: true, messageId };
      } catch (error) {
        return { ok: false, failure: toFailure(error) };
      }
    },
  };
}

async function resolveAuth(
  deps: SmtpTransportDeps,
  mailbox: typeof mailboxes.$inferSelect,
  now: Date,
  fetchToken: (request: TokenRequest) => Promise<unknown>,
): Promise<{ ok: true; auth: SMTPTransportOptions["auth"] } | { ok: false; failure: SendFailure }> {
  const refreshToken = decryptOptional(mailbox.oauthRefreshTokenEncrypted, deps.encryptionKey);
  if (mailbox.provider === "microsoft" || refreshToken) {
    if (!refreshToken) {
      return { ok: false, failure: { message: "Microsoft refresh token is missing", authFailed: true } };
    }
    const accessToken = decryptOptional(mailbox.oauthAccessTokenEncrypted, deps.encryptionKey) ?? "";
    const refreshed = await refreshMicrosoftSecrets({
      secrets: {
        refreshToken,
        accessToken,
        accessTokenExpiresAt: mailbox.oauthAccessTokenExpiresAt?.toISOString() ?? "",
      },
      env: deps.microsoft,
      now,
      fetchToken,
    });
    if (!refreshed.ok) return { ok: false, failure: { message: refreshed.message, authFailed: true } };
    if (refreshed.refreshed) {
      await deps.db
        .update(mailboxes)
        .set({
          oauthAccessTokenEncrypted: encryptString(refreshed.secrets.accessToken, deps.encryptionKey),
          oauthRefreshTokenEncrypted: encryptString(refreshed.secrets.refreshToken, deps.encryptionKey),
          oauthAccessTokenExpiresAt: new Date(refreshed.secrets.accessTokenExpiresAt),
          updatedAt: now,
        })
        .where(eq(mailboxes.id, mailbox.id));
    }
    return {
      ok: true,
      auth: { type: "OAuth2", user: mailbox.email, accessToken: refreshed.secrets.accessToken },
    };
  }
  const password = decryptOptional(mailbox.smtpPasswordEncrypted, deps.encryptionKey);
  if (!password) return { ok: false, failure: { message: "SMTP password is missing", authFailed: true } };
  return { ok: true, auth: { user: mailbox.smtpUsername || mailbox.email, pass: password } };
}

async function defaultFetchToken(request: TokenRequest): Promise<unknown> {
  const response = await fetch(request.url, { method: "POST", headers: request.headers, body: request.body });
  return response.json() as Promise<unknown>;
}

async function deliverWithNodemailer(
  options: SMTPTransportOptions,
  email: Parameters<SmtpTransport["send"]>[0],
): Promise<{ messageId?: string }> {
  const transport = nodemailer.createTransport(options);
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
  return { messageId: typeof sent.messageId === "string" ? sent.messageId : undefined };
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
