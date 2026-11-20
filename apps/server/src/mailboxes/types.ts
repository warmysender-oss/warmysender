import type { SocketSecurity } from "../../../../packages/core/src/mail/types.js"

export type ProbeInput = {
  host: string
  port: number
  security: SocketSecurity
  username: string
  password: string
  auth: "password" | "xoauth2"
}

export type MailboxRecord = {
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
  sendingDays: string[]
  windowStart: string
  windowEnd: string
  timeZone: string
  minGapMinutes: number
  maxGapMinutes: number
  signature: string
  rampStartedOn: string
  paused: boolean
  pauseReason: string | null
  smtpAuthFailureStreak: number
  imapAuthFailureStreak: number
  secretsCiphertext: string
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
