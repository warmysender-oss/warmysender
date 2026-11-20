/** Shared mailbox shapes. Persistence lives in the server; these are the rules. */

export const SOCKET_SECURITIES = ["ssl", "starttls", "none"] as const
export type SocketSecurity = (typeof SOCKET_SECURITIES)[number]

export const MAIL_PROVIDERS = ["smtp", "microsoft"] as const
export type MailProvider = (typeof MAIL_PROVIDERS)[number]

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
export type Weekday = (typeof WEEKDAYS)[number]

export const MAIL_PRESET_IDS = [
  "gmail",
  "google-workspace",
  "zoho",
  "hostinger",
  "fastmail",
  "custom",
] as const
export type MailPresetId = (typeof MAIL_PRESET_IDS)[number]

export type ServerEndpoint = {
  host: string
  port: number
  security: SocketSecurity
}

export type MailPreset = {
  id: MailPresetId
  label: string
  smtp: ServerEndpoint
  imap: ServerEndpoint
  /** When true, both usernames are the mailbox email address. */
  usernameIsEmail: boolean
  help: string
  /** Official SPF example for this host, when the vendor publishes one. */
  spfExample: string | null
  docsUrl: string | null
}

export type FieldError = {
  field: string
  message: string
}

export type MailboxSettings = {
  fromName: string
  email: string
  provider: MailProvider
  presetId: MailPresetId | "microsoft"
  smtpHost: string
  smtpPort: number
  smtpSecurity: SocketSecurity
  smtpUsername: string
  imapHost: string
  imapPort: number
  imapSecurity: SocketSecurity
  imapUsername: string
  dailyCap: number
  sendingDays: Weekday[]
  windowStart: string
  windowEnd: string
  timeZone: string
  minGapMinutes: number
  maxGapMinutes: number
  signature: string
}

export type SmtpSecretInput = {
  smtpPassword: string
  imapPassword: string
}

export type MicrosoftSecretPayload = {
  refreshToken: string
  accessToken: string
  accessTokenExpiresAt: string
}

export type MailboxSecretPayload =
  | { kind: "smtp"; smtpPassword: string; imapPassword: string }
  | ({ kind: "microsoft" } & MicrosoftSecretPayload)
