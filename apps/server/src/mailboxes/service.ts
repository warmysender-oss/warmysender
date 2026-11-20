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
  isoToWeekday,
  MICROSOFT_IMAP,
  MICROSOFT_SMTP,
  shouldAttemptLogin,
  todayInTimeZone,
  validateMailboxSettings,
  validateSmtpPasswords,
  weekdayToIso,
  type MailboxSettings,
  type SecretCodec,
} from "@warmysender/core"
import type { MailboxRecord, MailboxStore, MailboxView } from "./types.js"
import { testMailboxConnection, type MailboxProbes } from "./test-connection.js"
import type { ProbeInput } from "./types.js"

export type ServiceResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      status: number
      errors: { field: string; message: string }[]
      connection?: Awaited<ReturnType<typeof testMailboxConnection>>
    }

export function toMailboxView(record: MailboxRecord, now: Date): MailboxView {
  const ramp = effectiveDailyCap({
    configuredCap: record.dailyCap,
    rampStartedOn: record.rampStartedOn,
    today: todayInTimeZone(now, record.timezone),
  })
  return {
    id: record.id,
    provider: record.provider === "microsoft" ? "microsoft" : "smtp",
    presetId: record.provider,
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
    sendingDays: record.sendingDays.flatMap((day) => {
      const name = isoToWeekday(day)
      return name ? [name] : []
    }),
    windowStart: record.windowStart,
    windowEnd: record.windowEnd,
    timeZone: record.timezone,
    minGapMinutes: record.gapMinMinutes,
    maxGapMinutes: record.gapMaxMinutes,
    signature: record.signature,
    paused: record.health === "paused",
    pauseReason: record.pausedReason,
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
  const passwords = validateSmtpPasswords({
    smtpPassword: input.smtpPassword,
    imapPassword: input.imapPassword,
  })
  if (!passwords.ok) return { ok: false, status: 400, errors: passwords.errors }
  const existing = await ctx.store.findByEmail(settings.value.email)
  if (existing) {
    return { ok: false, status: 409, errors: [{ field: "email", message: "A mailbox for this address already exists." }] }
  }
  const record = baseRecord(settings.value, ctx.now, initialAuthHealth(), {
    smtpPasswordEncrypted: ctx.codec.encrypt(passwords.smtpPassword),
    imapPasswordEncrypted: ctx.codec.encrypt(passwords.imapPassword),
    oauthRefreshTokenEncrypted: null,
    oauthAccessTokenEncrypted: null,
    oauthAccessTokenExpiresAt: null,
  })
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
    ...draftFromRecord(current),
    ...input,
    provider: current.provider === "microsoft" ? "microsoft" : "smtp",
    presetId: input.presetId ?? current.provider,
  })
  if (!settings.ok) return { ok: false, status: 400, errors: settings.errors }
  const next = current.provider === "microsoft" ? microsoftSettings(settings.value) : settings.value
  if (next.email !== current.email) {
    const taken = await ctx.store.findByEmail(next.email)
    if (taken && taken.id !== current.id) {
      return { ok: false, status: 409, errors: [{ field: "email", message: "A mailbox for this address already exists." }] }
    }
  }
  let smtpPasswordEncrypted = current.smtpPasswordEncrypted
  let imapPasswordEncrypted = current.imapPasswordEncrypted
  if (current.provider !== "microsoft" && (input.smtpPassword !== undefined || input.imapPassword !== undefined)) {
    const smtpPassword = nonEmptyString(input.smtpPassword) ?? decrypt(current.smtpPasswordEncrypted, ctx.codec)
    const imapPassword = nonEmptyString(input.imapPassword) ?? decrypt(current.imapPasswordEncrypted, ctx.codec)
    if (smtpPassword === null || imapPassword === null) {
      return { ok: false, status: 500, errors: [{ field: "secrets", message: "Stored mailbox secrets are missing." }] }
    }
    smtpPasswordEncrypted = ctx.codec.encrypt(smtpPassword)
    imapPasswordEncrypted = ctx.codec.encrypt(imapPassword)
  }
  const updated = await ctx.store.update(id, {
    ...columnsFromSettings(next),
    smtpPasswordEncrypted,
    imapPasswordEncrypted,
    updatedAt: ctx.now.toISOString(),
  })
  return { ok: true, value: toMailboxView(updated, ctx.now) }
}

export async function recordMailboxAuth(
  id: string,
  ok: boolean,
  ctx: { store: MailboxStore; now: Date },
): Promise<ServiceResult<MailboxView>> {
  const current = await ctx.store.findById(id)
  if (!current) return { ok: false, status: 404, errors: [{ field: "id", message: "Mailbox not found." }] }
  if (!shouldAttemptLogin(current)) {
    return { ok: true, value: toMailboxView(current, ctx.now) }
  }
  const health = applyAuthResult(current, ok)
  const updated = await ctx.store.update(id, { ...health, updatedAt: ctx.now.toISOString() })
  return { ok: true, value: toMailboxView(updated, ctx.now) }
}

export async function reconnectSmtpMailbox(
  id: string,
  body: unknown,
  ctx: { store: MailboxStore; codec: SecretCodec; now: Date; probes: MailboxProbes },
): Promise<ServiceResult<{ mailbox: MailboxView; connection: Awaited<ReturnType<typeof testMailboxConnection>> }>> {
  const current = await ctx.store.findById(id)
  if (!current) return { ok: false, status: 404, errors: [{ field: "id", message: "Mailbox not found." }] }
  if (current.provider === "microsoft") {
    return {
      ok: false,
      status: 400,
      errors: [{ field: "provider", message: "Sign in with Microsoft again to reconnect this mailbox." }],
    }
  }
  const input = isRecord(body) ? body : {}
  const storedSmtp = decrypt(current.smtpPasswordEncrypted, ctx.codec)
  const storedImap = decrypt(current.imapPasswordEncrypted, ctx.codec)
  const smtpPassword = nonEmptyString(input.smtpPassword) ?? storedSmtp
  const imapPassword = nonEmptyString(input.imapPassword) ?? storedImap
  if (!smtpPassword || !imapPassword) {
    return { ok: false, status: 500, errors: [{ field: "secrets", message: "Stored mailbox secrets are missing." }] }
  }
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
  const updated = await ctx.store.update(id, {
    ...clearAuthPause(),
    smtpPasswordEncrypted: ctx.codec.encrypt(smtpPassword),
    imapPasswordEncrypted: ctx.codec.encrypt(imapPassword),
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
  if (current.provider !== "microsoft") {
    const smtpPassword = decrypt(current.smtpPasswordEncrypted, ctx.codec)
    const imapPassword = decrypt(current.imapPasswordEncrypted, ctx.codec)
    if (!smtpPassword || !imapPassword) {
      return { ok: false, status: 500, errors: [{ field: "secrets", message: "Stored mailbox secrets are missing." }] }
    }
    const connection = await testMailboxConnection(
      {
        smtp: probeFrom(current, "smtp", smtpPassword, "password"),
        imap: probeFrom(current, "imap", imapPassword, "password"),
      },
      ctx.probes,
    )
    return { ok: true, value: connection }
  }
  const token = ctx.accessToken ?? decrypt(current.oauthAccessTokenEncrypted, ctx.codec)
  if (!token) {
    return { ok: false, status: 422, errors: [{ field: "connection", message: "This Microsoft mailbox has no access token. Sign in again." }] }
  }
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
  refreshToken: string
  accessToken: string
  accessTokenExpiresAt: string
  now: Date
  codec: SecretCodec
  timeZone: string
}): MailboxRecord {
  const timeZone = input.timeZone || DEFAULT_TIME_ZONE
  const health = initialAuthHealth()
  const nowIso = input.now.toISOString()
  return {
    id: randomUUID(),
    provider: "microsoft",
    fromName: input.fromName,
    email: input.email,
    smtpHost: MICROSOFT_SMTP.host,
    smtpPort: MICROSOFT_SMTP.port,
    smtpSecurity: MICROSOFT_SMTP.security,
    smtpUsername: input.email,
    smtpPasswordEncrypted: null,
    imapHost: MICROSOFT_IMAP.host,
    imapPort: MICROSOFT_IMAP.port,
    imapSecurity: MICROSOFT_IMAP.security,
    imapUsername: input.email,
    imapPasswordEncrypted: null,
    oauthRefreshTokenEncrypted: input.codec.encrypt(input.refreshToken),
    oauthAccessTokenEncrypted: input.codec.encrypt(input.accessToken),
    oauthAccessTokenExpiresAt: input.accessTokenExpiresAt,
    dailyCap: DAILY_CAP_DEFAULT,
    sendingDays: DEFAULT_SENDING_DAYS.map(weekdayToIso),
    windowStart: DEFAULT_WINDOW_START,
    windowEnd: DEFAULT_WINDOW_END,
    timezone: timeZone,
    gapMinMinutes: GAP_DEFAULT_MIN_MINUTES,
    gapMaxMinutes: GAP_DEFAULT_MAX_MINUTES,
    signature: "",
    rampStartedOn: todayInTimeZone(input.now, timeZone),
    health: health.health,
    pausedReason: health.pausedReason,
    consecutiveAuthFailures: health.consecutiveAuthFailures,
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

function baseRecord(
  settings: MailboxSettings,
  now: Date,
  health: ReturnType<typeof initialAuthHealth>,
  secrets: Pick<
    MailboxRecord,
    | "smtpPasswordEncrypted"
    | "imapPasswordEncrypted"
    | "oauthRefreshTokenEncrypted"
    | "oauthAccessTokenEncrypted"
    | "oauthAccessTokenExpiresAt"
  >,
): MailboxRecord {
  const nowIso = now.toISOString()
  return {
    id: randomUUID(),
    ...columnsFromSettings(settings),
    ...secrets,
    rampStartedOn: todayInTimeZone(now, settings.timeZone),
    health: health.health,
    pausedReason: health.pausedReason,
    consecutiveAuthFailures: health.consecutiveAuthFailures,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

function columnsFromSettings(settings: MailboxSettings): Pick<
  MailboxRecord,
  | "fromName"
  | "email"
  | "provider"
  | "smtpHost"
  | "smtpPort"
  | "smtpSecurity"
  | "smtpUsername"
  | "imapHost"
  | "imapPort"
  | "imapSecurity"
  | "imapUsername"
  | "dailyCap"
  | "sendingDays"
  | "windowStart"
  | "windowEnd"
  | "timezone"
  | "gapMinMinutes"
  | "gapMaxMinutes"
  | "signature"
> {
  return {
    fromName: settings.fromName,
    email: settings.email,
    provider: settings.provider === "microsoft" ? "microsoft" : settings.presetId,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecurity: settings.smtpSecurity,
    smtpUsername: settings.smtpUsername,
    imapHost: settings.imapHost,
    imapPort: settings.imapPort,
    imapSecurity: settings.imapSecurity,
    imapUsername: settings.imapUsername,
    dailyCap: settings.dailyCap,
    sendingDays: settings.sendingDays.map(weekdayToIso),
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
    timezone: settings.timeZone,
    gapMinMinutes: settings.minGapMinutes,
    gapMaxMinutes: settings.maxGapMinutes,
    signature: settings.signature,
  }
}

function microsoftSettings(settings: MailboxSettings): MailboxSettings {
  return {
    ...settings,
    provider: "microsoft",
    presetId: "microsoft",
    smtpHost: MICROSOFT_SMTP.host,
    smtpPort: MICROSOFT_SMTP.port,
    smtpSecurity: MICROSOFT_SMTP.security,
    smtpUsername: settings.email,
    imapHost: MICROSOFT_IMAP.host,
    imapPort: MICROSOFT_IMAP.port,
    imapSecurity: MICROSOFT_IMAP.security,
    imapUsername: settings.email,
  }
}

function draftFromRecord(record: MailboxRecord): Record<string, unknown> {
  const view = toMailboxView(record, new Date())
  return {
    fromName: view.fromName,
    email: view.email,
    provider: view.provider,
    presetId: view.presetId,
    smtpHost: view.smtpHost,
    smtpPort: view.smtpPort,
    smtpSecurity: view.smtpSecurity,
    smtpUsername: view.smtpUsername,
    imapHost: view.imapHost,
    imapPort: view.imapPort,
    imapSecurity: view.imapSecurity,
    imapUsername: view.imapUsername,
    dailyCap: view.dailyCap,
    sendingDays: view.sendingDays,
    windowStart: view.windowStart,
    windowEnd: view.windowEnd,
    timeZone: view.timeZone,
    minGapMinutes: view.minGapMinutes,
    maxGapMinutes: view.maxGapMinutes,
    signature: view.signature,
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

function decrypt(payload: string | null, codec: SecretCodec): string | null {
  if (!payload) return null
  return codec.decrypt(payload)
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
