import { randomUUID } from "node:crypto"
import {
  applyAuthResult,
  clearAuthPause,
  DAILY_CAP_DEFAULT,
  DEFAULT_SENDING_DAYS,
  DEFAULT_TIME_ZONE,
  DEFAULT_WINDOW_END,
  DEFAULT_WINDOW_START,
  effectiveDailyCap,
  findPreset,
  GAP_DEFAULT_MAX_MINUTES,
  GAP_DEFAULT_MIN_MINUTES,
  initialAuthHealth,
  MICROSOFT_IMAP,
  MICROSOFT_SMTP,
  openSecrets,
  sealSecrets,
  shouldAttemptLogin,
  todayInTimeZone,
  validateMailboxSettings,
  validateSmtpPasswords,
  type MailboxSecretPayload,
  type SecretCodec,
} from "../../../../packages/core/src/mail/index.js"
import type { MailboxRecord, MailboxStore, MailboxView } from "./types.js"
import { testMailboxConnection, type MailboxProbes } from "./test-connection.js"
import type { ProbeInput } from "./types.js"

export type ServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; errors: { field: string; message: string }[]; connection?: Awaited<ReturnType<typeof testMailboxConnection>> }

export function toMailboxView(record: MailboxRecord, now: Date): MailboxView {
  const ramp = effectiveDailyCap({
    configuredCap: record.dailyCap,
    rampStartedOn: record.rampStartedOn,
    today: todayInTimeZone(now, record.timeZone),
  })
  return {
    id: record.id,
    provider: record.provider,
    presetId: record.presetId,
    fromName: record.fromName,
    email: record.email,
    smtpHost: record.smtpHost,
    smtpPort: record.smtpPort,
    smtpSecurity: record.smtpSecurity,
    smtpUsername: record.smtpUsername,
    imapHost: record.imapHost,
    imapPort: record.imapPort,
    imapSecurity: record.imapSecurity,
    imapUsername: record.imapUsername,
    dailyCap: record.dailyCap,
    effectiveDailyCap: ramp.cap,
    rampDay: ramp.rampDay,
    inRamp: ramp.inRamp,
    rampLabel: ramp.label,
    sendingDays: record.sendingDays,
    windowStart: record.windowStart,
    windowEnd: record.windowEnd,
    timeZone: record.timeZone,
    minGapMinutes: record.minGapMinutes,
    maxGapMinutes: record.maxGapMinutes,
    signature: record.signature,
    paused: record.paused,
    pauseReason: record.pauseReason,
    createdAt: record.createdAt,
  }
}

export async function listMailboxViews(store: MailboxStore, now: Date): Promise<MailboxView[]> {
  const rows = await store.list()
  return rows.map((row) => toMailboxView(row, now))
}

export async function createSmtpMailbox(
  body: unknown,
  ctx: { store: MailboxStore; codec: SecretCodec; now: Date },
): Promise<ServiceResult<MailboxView>> {
  const input = isRecord(body) ? body : {}
  const settings = validateMailboxSettings({ ...input, provider: "smtp" })
  if (!settings.ok) return { ok: false, status: 400, errors: settings.errors }
  if (settings.value.provider !== "smtp") {
    return { ok: false, status: 400, errors: [{ field: "provider", message: "Use Microsoft sign-in for Microsoft mailboxes." }] }
  }
  const passwords = validateSmtpPasswords({
    smtpPassword: input.smtpPassword,
    imapPassword: input.imapPassword,
  })
  if (!passwords.ok) return { ok: false, status: 400, errors: passwords.errors }
  const existing = await ctx.store.findByEmail(settings.value.email)
  if (existing) {
    return { ok: false, status: 409, errors: [{ field: "email", message: "A mailbox for this address already exists." }] }
  }
  const health = initialAuthHealth()
  const nowIso = ctx.now.toISOString()
  const record: MailboxRecord = {
    id: randomUUID(),
    ...settings.value,
    sendingDays: settings.value.sendingDays,
    rampStartedOn: todayInTimeZone(ctx.now, settings.value.timeZone),
    paused: health.paused,
    pauseReason: health.pauseReason,
    smtpAuthFailureStreak: health.smtpAuthFailureStreak,
    imapAuthFailureStreak: health.imapAuthFailureStreak,
    secretsCiphertext: sealSecrets(
      { kind: "smtp", smtpPassword: passwords.smtpPassword, imapPassword: passwords.imapPassword },
      ctx.codec,
    ),
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  await ctx.store.insert(record)
  return { ok: true, value: toMailboxView(record, ctx.now) }
}

export async function updateMailbox(
  id: string,
  body: unknown,
  ctx: { store: MailboxStore; codec: SecretCodec; now: Date },
): Promise<ServiceResult<MailboxView>> {
  const current = await ctx.store.findById(id)
  if (!current) return { ok: false, status: 404, errors: [{ field: "id", message: "Mailbox not found." }] }
  const input = isRecord(body) ? body : {}
  const settings = validateMailboxSettings({
    ...viewAsDraft(current),
    ...input,
    provider: current.provider,
    presetId: input.presetId ?? current.presetId,
  })
  if (!settings.ok) return { ok: false, status: 400, errors: settings.errors }
  const nextSettings = current.provider === "microsoft"
    ? {
        ...settings.value,
        provider: "microsoft" as const,
        presetId: "microsoft" as const,
        smtpHost: MICROSOFT_SMTP.host,
        smtpPort: MICROSOFT_SMTP.port,
        smtpSecurity: MICROSOFT_SMTP.security,
        smtpUsername: settings.value.email,
        imapHost: MICROSOFT_IMAP.host,
        imapPort: MICROSOFT_IMAP.port,
        imapSecurity: MICROSOFT_IMAP.security,
        imapUsername: settings.value.email,
      }
    : settings.value
  if (nextSettings.email !== current.email) {
    const taken = await ctx.store.findByEmail(nextSettings.email)
    if (taken && taken.id !== current.id) {
      return { ok: false, status: 409, errors: [{ field: "email", message: "A mailbox for this address already exists." }] }
    }
  }
  let secretsCiphertext = current.secretsCiphertext
  if (current.provider === "smtp" && (input.smtpPassword !== undefined || input.imapPassword !== undefined)) {
    const existing = openSecrets(current.secretsCiphertext, ctx.codec)
    if (existing.kind !== "smtp") {
      return { ok: false, status: 500, errors: [{ field: "secrets", message: "Stored mailbox secrets have the wrong shape." }] }
    }
    const smtpPassword = typeof input.smtpPassword === "string" && input.smtpPassword.length > 0 ? input.smtpPassword : existing.smtpPassword
    const imapPassword = typeof input.imapPassword === "string" && input.imapPassword.length > 0 ? input.imapPassword : existing.imapPassword
    secretsCiphertext = sealSecrets({ kind: "smtp", smtpPassword, imapPassword }, ctx.codec)
  }
  const updated = await ctx.store.update(id, {
    ...nextSettings,
    sendingDays: nextSettings.sendingDays,
    secretsCiphertext,
    updatedAt: ctx.now.toISOString(),
  })
  return { ok: true, value: toMailboxView(updated, ctx.now) }
}

export async function recordMailboxAuth(
  id: string,
  channel: "smtp" | "imap",
  ok: boolean,
  ctx: { store: MailboxStore; now: Date },
): Promise<ServiceResult<MailboxView>> {
  const current = await ctx.store.findById(id)
  if (!current) return { ok: false, status: 404, errors: [{ field: "id", message: "Mailbox not found." }] }
  if (!shouldAttemptLogin(current)) {
    return { ok: true, value: toMailboxView(current, ctx.now) }
  }
  const health = applyAuthResult(current, channel, ok)
  const updated = await ctx.store.update(id, {
    ...health,
    updatedAt: ctx.now.toISOString(),
  })
  return { ok: true, value: toMailboxView(updated, ctx.now) }
}

export async function reconnectSmtpMailbox(
  id: string,
  body: unknown,
  ctx: { store: MailboxStore; codec: SecretCodec; now: Date; probes: MailboxProbes },
): Promise<ServiceResult<{ mailbox: MailboxView; connection: Awaited<ReturnType<typeof testMailboxConnection>> }>> {
  const current = await ctx.store.findById(id)
  if (!current) return { ok: false, status: 404, errors: [{ field: "id", message: "Mailbox not found." }] }
  if (current.provider !== "smtp") {
    return {
      ok: false,
      status: 400,
      errors: [{ field: "provider", message: "Sign in with Microsoft again to reconnect this mailbox." }],
    }
  }
  const input = isRecord(body) ? body : {}
  const existing = openSecrets(current.secretsCiphertext, ctx.codec)
  if (existing.kind !== "smtp") {
    return { ok: false, status: 500, errors: [{ field: "secrets", message: "Stored mailbox secrets have the wrong shape." }] }
  }
  const smtpPassword = typeof input.smtpPassword === "string" && input.smtpPassword.length > 0 ? input.smtpPassword : existing.smtpPassword
  const imapPassword = typeof input.imapPassword === "string" && input.imapPassword.length > 0 ? input.imapPassword : existing.imapPassword
  const connection = await testMailboxConnection(
    {
      smtp: probeFrom(current, "smtp", smtpPassword, "password"),
      imap: probeFrom(current, "imap", imapPassword, "password"),
    },
    ctx.probes,
  )
  if (!connection.ok) {
    return {
      ok: false,
      status: 422,
      errors: [{ field: "connection", message: `${connection.smtp.message} ${connection.imap.message}` }],
      connection,
    }
  }
  const health = clearAuthPause()
  const updated = await ctx.store.update(id, {
    ...health,
    secretsCiphertext: sealSecrets({ kind: "smtp", smtpPassword, imapPassword }, ctx.codec),
    updatedAt: ctx.now.toISOString(),
  })
  return { ok: true, value: { mailbox: toMailboxView(updated, ctx.now), connection } }
}

export async function testStoredMailbox(
  id: string,
  ctx: { store: MailboxStore; codec: SecretCodec; probes: MailboxProbes; accessToken?: string },
): Promise<ServiceResult<Awaited<ReturnType<typeof testMailboxConnection>>>> {
  const current = await ctx.store.findById(id)
  if (!current) return { ok: false, status: 404, errors: [{ field: "id", message: "Mailbox not found." }] }
  const secrets = openSecrets(current.secretsCiphertext, ctx.codec)
  if (secrets.kind === "smtp") {
    const connection = await testMailboxConnection(
      {
        smtp: probeFrom(current, "smtp", secrets.smtpPassword, "password"),
        imap: probeFrom(current, "imap", secrets.imapPassword, "password"),
      },
      ctx.probes,
    )
    return { ok: true, value: connection }
  }
  const token = ctx.accessToken ?? secrets.accessToken
  const connection = await testMailboxConnection(
    {
      smtp: probeFrom(current, "smtp", token, "xoauth2"),
      imap: probeFrom(current, "imap", token, "xoauth2"),
    },
    ctx.probes,
  )
  return { ok: true, value: connection }
}

export function microsoftRecordFromToken(input: {
  email: string
  fromName: string
  secrets: Extract<MailboxSecretPayload, { kind: "microsoft" }>
  now: Date
  codec: SecretCodec
  timeZone: string
}): MailboxRecord {
  const health = initialAuthHealth()
  const nowIso = input.now.toISOString()
  return {
    id: randomUUID(),
    provider: "microsoft",
    presetId: "microsoft",
    fromName: input.fromName,
    email: input.email,
    smtpHost: MICROSOFT_SMTP.host,
    smtpPort: MICROSOFT_SMTP.port,
    smtpSecurity: MICROSOFT_SMTP.security,
    smtpUsername: input.email,
    imapHost: MICROSOFT_IMAP.host,
    imapPort: MICROSOFT_IMAP.port,
    imapSecurity: MICROSOFT_IMAP.security,
    imapUsername: input.email,
    dailyCap: DAILY_CAP_DEFAULT,
    sendingDays: [...DEFAULT_SENDING_DAYS],
    windowStart: DEFAULT_WINDOW_START,
    windowEnd: DEFAULT_WINDOW_END,
    timeZone: input.timeZone || DEFAULT_TIME_ZONE,
    minGapMinutes: GAP_DEFAULT_MIN_MINUTES,
    maxGapMinutes: GAP_DEFAULT_MAX_MINUTES,
    signature: "",
    rampStartedOn: todayInTimeZone(input.now, input.timeZone),
    paused: health.paused,
    pauseReason: health.pauseReason,
    smtpAuthFailureStreak: health.smtpAuthFailureStreak,
    imapAuthFailureStreak: health.imapAuthFailureStreak,
    secretsCiphertext: sealSecrets(input.secrets, input.codec),
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

export function applyPresetBody(presetId: string, email: string): Record<string, unknown> | null {
  const preset = findPreset(presetId)
  if (!preset) return null
  return {
    presetId: preset.id,
    smtpHost: preset.smtp.host,
    smtpPort: preset.smtp.port,
    smtpSecurity: preset.smtp.security,
    imapHost: preset.imap.host,
    imapPort: preset.imap.port,
    imapSecurity: preset.imap.security,
    smtpUsername: preset.usernameIsEmail ? email : "",
    imapUsername: preset.usernameIsEmail ? email : "",
  }
}

function probeFrom(record: MailboxRecord, side: "smtp" | "imap", password: string, auth: ProbeInput["auth"]): ProbeInput {
  if (side === "smtp") {
    return {
      host: record.smtpHost,
      port: record.smtpPort,
      security: record.smtpSecurity,
      username: record.smtpUsername,
      password,
      auth,
    }
  }
  return {
    host: record.imapHost,
    port: record.imapPort,
    security: record.imapSecurity,
    username: record.imapUsername,
    password,
    auth,
  }
}

function viewAsDraft(record: MailboxRecord): Record<string, unknown> {
  return { ...record }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
