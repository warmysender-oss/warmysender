import type { MailboxHealthState, SocketSecurity } from "@warmysender/core"

export type ProbeInput = {
  host: string
  port: number
  security: SocketSecurity
  username: string
  password: string
  auth: "password" | "xoauth2"
}

/** Column shape of mailboxes, with timestamps as ISO strings and secrets already encrypted. */
export type MailboxRecord = {
  id: string
  fromName: string
  email: string
  /** Preset id (gmail, zoho, custom, …) or microsoft. */
  provider: string
  smtpHost: string
  smtpPort: number
  smtpSecurity: SocketSecurity
  smtpUsername: string
  smtpPasswordEncrypted: string | null
  imapHost: string
  imapPort: number
  imapSecurity: SocketSecurity
  imapUsername: string
  imapPasswordEncrypted: string | null
  oauthRefreshTokenEncrypted: string | null
  oauthAccessTokenEncrypted: string | null
  oauthAccessTokenExpiresAt: string | null
  sendingDays: number[]
  windowStart: string
  windowEnd: string
  timezone: string
  gapMinMinutes: number
  gapMaxMinutes: number
  dailyCap: number
  signature: string
  rampStartedOn: string
  health: MailboxHealthState
  pausedReason: string | null
  consecutiveAuthFailures: number
  createdAt: string
  updatedAt: string
}

export type MailboxStore = {
  list(): Promise<MailboxRecord[]>
  findById(id: string): Promise<MailboxRecord | null>
  findByEmail(email: string): Promise<MailboxRecord | null>
  insert(record: MailboxRecord): Promise<MailboxRecord>
  update(id: string, patch: Partial<MailboxRecord>): Promise<MailboxRecord>
}

export type MailboxView = {
  id: string
  provider: "smtp" | "microsoft"
  presetId: string
  fromName: string
  email: string
  smtpHost: string
  smtpPort: number
  smtpSecurity: SocketSecurity
  smtpUsername: string
  imapHost: string
  imapPort: number
  imapSecurity: SocketSecurity
  imapUsername: string
  dailyCap: number
  effectiveDailyCap: number
  rampDay: number
  inRamp: boolean
  rampLabel: string | null
  sendingDays: string[]
  windowStart: string
  windowEnd: string
  timeZone: string
  minGapMinutes: number
  maxGapMinutes: number
  signature: string
  paused: boolean
  pauseReason: string | null
  createdAt: string
}
