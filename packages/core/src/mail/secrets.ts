import type { MailboxSecretPayload } from "./types.js"

export type SecretCodec = {
  encrypt(plain: string): string
  decrypt(payload: string): string
}

export function packSecrets(secrets: MailboxSecretPayload): string {
  return JSON.stringify(secrets)
}

export function unpackSecrets(packed: string): MailboxSecretPayload {
  const parsed: unknown = JSON.parse(packed)
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Mailbox secret payload is not an object.")
  }
  const record = parsed as Record<string, unknown>
  if (record.kind === "smtp" && typeof record.smtpPassword === "string" && typeof record.imapPassword === "string") {
    return { kind: "smtp", smtpPassword: record.smtpPassword, imapPassword: record.imapPassword }
  }
  if (
    record.kind === "microsoft" &&
    typeof record.refreshToken === "string" &&
    typeof record.accessToken === "string" &&
    typeof record.accessTokenExpiresAt === "string"
  ) {
    return {
      kind: "microsoft",
      refreshToken: record.refreshToken,
      accessToken: record.accessToken,
      accessTokenExpiresAt: record.accessTokenExpiresAt,
    }
  }
  throw new Error("Mailbox secret payload has an unknown shape.")
}

export function sealSecrets(secrets: MailboxSecretPayload, codec: SecretCodec): string {
  return codec.encrypt(packSecrets(secrets))
}

export function openSecrets(sealed: string, codec: SecretCodec): MailboxSecretPayload {
  return unpackSecrets(codec.decrypt(sealed))
}
