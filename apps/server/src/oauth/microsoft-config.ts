/** Spec §3.2. The list lives in core so the sender and the sign-in screen share it. */
export { MICROSOFT_SCOPES } from "@warmysender/core"

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
