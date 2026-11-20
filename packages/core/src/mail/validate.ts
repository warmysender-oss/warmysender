import { FROM_NAME_MAX_CHARS, SIGNATURE_MAX_CHARS, validateDailyCap, validateGapPair } from "./limits.js"
import { parseSendingWindow } from "./window.js"
import {
  MAIL_PRESET_IDS,
  MAIL_PROVIDERS,
  SOCKET_SECURITIES,
  type FieldError,
  type MailboxSettings,
  type MailPresetId,
  type MailProvider,
  type SocketSecurity,
} from "./types.js"

const EMAIL =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

const HOST =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

export type MailboxDraftInput = {
  fromName: unknown
  email: unknown
  provider: unknown
  presetId: unknown
  smtpHost: unknown
  smtpPort: unknown
  smtpSecurity: unknown
  smtpUsername: unknown
  imapHost: unknown
  imapPort: unknown
  imapSecurity: unknown
  imapUsername: unknown
  dailyCap: unknown
  sendingDays: unknown
  windowStart: unknown
  windowEnd: unknown
  timeZone: unknown
  minGapMinutes: unknown
  maxGapMinutes: unknown
  signature: unknown
}

export function validateMailboxSettings(
  input: object,
): { ok: true; value: MailboxSettings } | { ok: false; errors: FieldError[] } {
  const record = input as Record<string, unknown>
  const errors: FieldError[] = []

  const fromName = requiredText(record.fromName, FROM_NAME_MAX_CHARS)
  if (!fromName.ok) errors.push({ field: "fromName", message: "Enter the name recipients should see." })

  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : ""
  if (!EMAIL.test(email)) {
    errors.push({ field: "email", message: "Enter a valid email address." })
  }

  if (!isProvider(record.provider)) {
    errors.push({ field: "provider", message: "Provider must be smtp or microsoft." })
  }
  const provider: MailProvider = isProvider(record.provider) ? record.provider : "smtp"

  const presetId = parsePresetId(record.presetId, provider)
  if (!presetId.ok) errors.push({ field: "presetId", message: presetId.message })

  const smtpHost = hostField(record.smtpHost)
  const imapHost = hostField(record.imapHost)
  if (!smtpHost.ok) errors.push({ field: "smtpHost", message: "Enter the SMTP host name." })
  if (!imapHost.ok) errors.push({ field: "imapHost", message: "Enter the IMAP host name." })

  const smtpPort = portField(record.smtpPort)
  const imapPort = portField(record.imapPort)
  if (!smtpPort.ok) errors.push({ field: "smtpPort", message: smtpPort.message })
  if (!imapPort.ok) errors.push({ field: "imapPort", message: imapPort.message })

  const smtpSecurity = record.smtpSecurity
  const imapSecurity = record.imapSecurity
  if (!isSecurity(smtpSecurity)) {
    errors.push({ field: "smtpSecurity", message: "SMTP security must be ssl, starttls, or none." })
  }
  if (!isSecurity(imapSecurity)) {
    errors.push({ field: "imapSecurity", message: "IMAP security must be ssl, starttls, or none." })
  }

  const smtpUsername = requiredText(record.smtpUsername, 320)
  const imapUsername = requiredText(record.imapUsername, 320)
  if (!smtpUsername.ok) errors.push({ field: "smtpUsername", message: "Enter the SMTP username." })
  if (!imapUsername.ok) errors.push({ field: "imapUsername", message: "Enter the IMAP username." })

  const cap = validateDailyCap(record.dailyCap)
  if (!cap.ok) errors.push({ field: "dailyCap", message: cap.message })

  const days = Array.isArray(record.sendingDays) ? record.sendingDays.map(String) : []
  const window = parseSendingWindow({
    days,
    windowStart: record.windowStart,
    windowEnd: record.windowEnd,
    timeZone: record.timeZone,
  })
  if (!window.ok) errors.push(...window.errors)

  const gaps = validateGapPair(record.minGapMinutes, record.maxGapMinutes)
  if (!gaps.ok) errors.push(...gaps.errors)

  const signature = typeof record.signature === "string" ? record.signature : ""
  if (signature.length > SIGNATURE_MAX_CHARS) {
    errors.push({ field: "signature", message: `Signature must be ${SIGNATURE_MAX_CHARS} characters or fewer.` })
  }

  if (
    errors.length > 0 ||
    !fromName.ok ||
    !smtpHost.ok ||
    !imapHost.ok ||
    !smtpPort.ok ||
    !imapPort.ok ||
    !smtpUsername.ok ||
    !imapUsername.ok ||
    !cap.ok ||
    !window.ok ||
    !gaps.ok ||
    !presetId.ok ||
    !isSecurity(smtpSecurity) ||
    !isSecurity(imapSecurity)
  ) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    value: {
      fromName: fromName.value,
      email,
      provider,
      presetId: presetId.value,
      smtpHost: smtpHost.value,
      smtpPort: smtpPort.value,
      smtpSecurity,
      smtpUsername: smtpUsername.value,
      imapHost: imapHost.value,
      imapPort: imapPort.value,
      imapSecurity,
      imapUsername: imapUsername.value,
      dailyCap: cap.value,
      sendingDays: window.value.days,
      windowStart: String(record.windowStart),
      windowEnd: String(record.windowEnd),
      timeZone: window.value.timeZone,
      minGapMinutes: gaps.minGapMinutes,
      maxGapMinutes: gaps.maxGapMinutes,
      signature,
    },
  }
}

export function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@")
  if (at < 1 || at === email.length - 1) return null
  return email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "")
}

export function validateSmtpPasswords(input: {
  smtpPassword: unknown
  imapPassword: unknown
}): { ok: true; smtpPassword: string; imapPassword: string } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = []
  if (typeof input.smtpPassword !== "string" || input.smtpPassword.length === 0) {
    errors.push({ field: "smtpPassword", message: "Enter the SMTP password." })
  }
  if (typeof input.imapPassword !== "string" || input.imapPassword.length === 0) {
    errors.push({ field: "imapPassword", message: "Enter the IMAP password." })
  }
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    smtpPassword: input.smtpPassword as string,
    imapPassword: input.imapPassword as string,
  }
}

function requiredText(value: unknown, max: number): { ok: true; value: string } | { ok: false } {
  if (typeof value !== "string") return { ok: false }
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > max) return { ok: false }
  return { ok: true, value: trimmed }
}

function hostField(value: unknown): { ok: true; value: string } | { ok: false } {
  if (typeof value !== "string") return { ok: false }
  const host = value.trim().toLowerCase().replace(/\.$/, "")
  if (!HOST.test(host)) return { ok: false }
  return { ok: true, value: host }
}

function portField(value: unknown): { ok: true; value: number } | { ok: false; message: string } {
  const port = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return { ok: false, message: "Port must be a number from 1 to 65535." }
  }
  return { ok: true, value: port }
}

function isSecurity(value: unknown): value is SocketSecurity {
  return typeof value === "string" && (SOCKET_SECURITIES as readonly string[]).includes(value)
}

function isProvider(value: unknown): value is MailProvider {
  return typeof value === "string" && (MAIL_PROVIDERS as readonly string[]).includes(value)
}

function parsePresetId(
  value: unknown,
  provider: MailProvider,
): { ok: true; value: MailPresetId | "microsoft" } | { ok: false; message: string } {
  if (provider === "microsoft") {
    if (value === undefined || value === "microsoft") return { ok: true, value: "microsoft" }
    return { ok: false, message: "Microsoft mailboxes do not use an SMTP preset." }
  }
  if (typeof value === "string" && (MAIL_PRESET_IDS as readonly string[]).includes(value)) {
    return { ok: true, value: value as MailPresetId }
  }
  return { ok: false, message: "Choose a mailbox preset." }
}
