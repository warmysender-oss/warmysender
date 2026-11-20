/** Spec §3.2. Do not add or drop a scope here without updating docs/MICROSOFT-APP.md. */
export const MICROSOFT_SCOPES = [
  "offline_access",
  "https://outlook.office.com/SMTP.Send",
  "https://outlook.office.com/IMAP.AccessAsUser.All",
  "openid",
  "email",
] as const

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

export type MicrosoftEnv = {
  clientId?: string
  clientSecret?: string
  tenant?: string
  publicUrl?: string
  sessionSecret?: string
}

export function readMicrosoftEnv(env: Record<string, string | undefined>): MicrosoftEnv {
  return {
    clientId: emptyToUndefined(env.MS_CLIENT_ID),
    clientSecret: emptyToUndefined(env.MS_CLIENT_SECRET),
    tenant: emptyToUndefined(env.MS_TENANT),
    publicUrl: emptyToUndefined(env.PUBLIC_URL),
    sessionSecret: emptyToUndefined(env.SESSION_SECRET),
  }
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}
