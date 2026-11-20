import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { MICROSOFT_SCOPES, OAUTH_STATE_TTL_MS, type MicrosoftEnv } from "./microsoft-config.js"

export function signOAuthState(secret: string, nowMs: number, nonce = randomBytes(16).toString("base64url")): string {
  const payload = Buffer.from(JSON.stringify({ nonce, issuedAt: nowMs }), "utf8").toString("base64url")
  const signature = createHmac("sha256", secret).update(payload).digest("base64url")
  return `${payload}.${signature}`
}

export function verifyOAuthState(token: string, secret: string, nowMs: number): { ok: true } | { ok: false; message: string } {
  const parts = token.split(".")
  if (parts.length !== 2) return { ok: false, message: "The Microsoft sign-in state is invalid. Start sign-in again." }
  const payload = parts[0]
  const signature = parts[1]
  if (!payload || !signature) return { ok: false, message: "The Microsoft sign-in state is invalid. Start sign-in again." }
  const expected = createHmac("sha256", secret).update(payload).digest("base64url")
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, message: "The Microsoft sign-in state is invalid. Start sign-in again." }
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (!parsed || typeof parsed !== "object" || typeof (parsed as { issuedAt?: unknown }).issuedAt !== "number") {
      return { ok: false, message: "The Microsoft sign-in state is invalid. Start sign-in again." }
    }
    const issuedAt = (parsed as { issuedAt: number }).issuedAt
    if (nowMs - issuedAt > OAUTH_STATE_TTL_MS || issuedAt > nowMs + 60_000) {
      return { ok: false, message: "The Microsoft sign-in link expired. Start sign-in again." }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: "The Microsoft sign-in state is invalid. Start sign-in again." }
  }
}

export function microsoftAvailability(env: MicrosoftEnv): MicrosoftAvailability {
  const redirectUri = env.publicUrl ? redirectUriFromPublicUrl(env.publicUrl) : null
  const scopes = MICROSOFT_SCOPES.join(" ")
  const missing: string[] = []
  if (!env.clientId) missing.push("MS_CLIENT_ID")
  if (!env.clientSecret) missing.push("MS_CLIENT_SECRET")
  if (!env.sessionSecret) missing.push("SESSION_SECRET")
  if (!redirectUri) missing.push("PUBLIC_URL")
  const tenant = env.tenant?.trim() || "common"
  if (!isTenant(tenant)) {
    return {
      available: false,
      message: "MS_TENANT must be common, organizations, consumers, or your tenant id.",
      redirectUri,
      docsPath: "docs/MICROSOFT-APP.md",
      scopes,
    }
  }
  if (missing.length > 0) {
    const redirect = redirectUri ?? "${PUBLIC_URL}/api/oauth/microsoft/callback"
    return {
      available: false,
      message: `Sign in with Microsoft uses an Entra app you create yourself. Set ${missing.join(", ")} and restart. Register the redirect URL ${redirect} and the scopes ${scopes}. The steps are in docs/MICROSOFT-APP.md.`,
      redirectUri,
      docsPath: "docs/MICROSOFT-APP.md",
      scopes,
    }
  }
  return { available: true, redirectUri: redirectUri as string, scopes, tenant }
}

export function buildAuthorizeUrl(input: {
  clientId: string
  tenant: string
  redirectUri: string
  state: string
  scopes: string
}): string {
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(input.tenant)}/oauth2/v2.0/authorize`)
  url.searchParams.set("client_id", input.clientId)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("redirect_uri", input.redirectUri)
  url.searchParams.set("response_mode", "query")
  url.searchParams.set("scope", input.scopes)
  url.searchParams.set("state", input.state)
  url.searchParams.set("prompt", "select_account")
  return url.toString()
}

export function buildTokenRequest(input: {
  tenant: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string
  code?: string
  refreshToken?: string
}): { url: string; body: string; headers: { "content-type": string } } {
  const params = new URLSearchParams()
  params.set("client_id", input.clientId)
  params.set("client_secret", input.clientSecret)
  params.set("scope", input.scopes)
  if (input.code) {
    params.set("grant_type", "authorization_code")
    params.set("code", input.code)
    params.set("redirect_uri", input.redirectUri)
  } else if (input.refreshToken) {
    params.set("grant_type", "refresh_token")
    params.set("refresh_token", input.refreshToken)
  } else {
    throw new Error("A Microsoft token request needs a code or a refresh token.")
  }
  return {
    url: `https://login.microsoftonline.com/${encodeURIComponent(input.tenant)}/oauth2/v2.0/token`,
    body: params.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }
}

export function readTokenResponse(
  payload: unknown,
  now: Date,
  previousRefreshToken?: string,
):
  | { ok: true; accessToken: string; refreshToken: string; accessTokenExpiresAt: string; idToken: string | null }
  | { ok: false; message: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "Microsoft did not return a token. Try signing in again." }
  }
  const record = payload as Record<string, unknown>
  if (typeof record.error === "string") {
    return { ok: false, message: "Microsoft refused the sign-in. Check the Entra app secret and redirect URL, then try again." }
  }
  if (typeof record.access_token !== "string" || record.access_token.length === 0) {
    return { ok: false, message: "Microsoft did not return an access token. Try signing in again." }
  }
  const refreshToken = typeof record.refresh_token === "string" && record.refresh_token.length > 0
    ? record.refresh_token
    : previousRefreshToken
  if (!refreshToken) {
    return {
      ok: false,
      message: "Microsoft did not return a refresh token. Confirm the app requests offline_access, then sign in again.",
    }
  }
  const expiresIn = typeof record.expires_in === "number" ? record.expires_in : 3600
  return {
    ok: true,
    accessToken: record.access_token,
    refreshToken,
    accessTokenExpiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    idToken: typeof record.id_token === "string" ? record.id_token : null,
  }
}

export function nameFromIdToken(idToken: string): string | null {
  const record = idTokenPayload(idToken)
  if (!record) return null
  return firstString(record.name)
}

export function emailFromIdToken(idToken: string): string | null {
  const record = idTokenPayload(idToken)
  if (!record) return null
  const email = firstString(record.email) ?? firstString(record.preferred_username)
  if (!email || !email.includes("@")) return null
  return email.trim().toLowerCase()
}

function idTokenPayload(idToken: string): Record<string, unknown> | null {
  const parts = idToken.split(".")
  const body = parts[1]
  if (!body) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
    if (!parsed || typeof parsed !== "object") return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

export async function refreshMicrosoftSecrets(input: {
  secrets: { refreshToken: string; accessToken: string; accessTokenExpiresAt: string }
  env: MicrosoftEnv
  now: Date
  fetchToken: (request: { url: string; body: string; headers: { "content-type": string } }) => Promise<unknown>
}): Promise<
  | { ok: true; secrets: { refreshToken: string; accessToken: string; accessTokenExpiresAt: string }; refreshed: boolean }
  | { ok: false; message: string }
> {
  if (!accessTokenNeedsRefresh(input.secrets.accessTokenExpiresAt, input.now)) {
    return { ok: true, secrets: input.secrets, refreshed: false }
  }
  const availability = microsoftAvailability(input.env)
  if (!availability.available || !input.env.clientId || !input.env.clientSecret) {
    return { ok: false, message: "Microsoft sign-in is not configured, so the access token cannot be refreshed." }
  }
  const request = buildTokenRequest({
    tenant: availability.tenant,
    clientId: input.env.clientId,
    clientSecret: input.env.clientSecret,
    redirectUri: availability.redirectUri,
    scopes: availability.scopes,
    refreshToken: input.secrets.refreshToken,
  })
  const token = readTokenResponse(await input.fetchToken(request), input.now, input.secrets.refreshToken)
  if (!token.ok) return token
  return {
    ok: true,
    refreshed: true,
    secrets: {
      refreshToken: token.refreshToken,
      accessToken: token.accessToken,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
    },
  }
}

export function accessTokenNeedsRefresh(expiresAtIso: string, now: Date, skewMs = 60_000): boolean {
  const expires = Date.parse(expiresAtIso)
  if (Number.isNaN(expires)) return true
  return expires - now.getTime() <= skewMs
}

export function redirectUriFromPublicUrl(publicUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(publicUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
  return `${publicUrl.replace(/\/+$/, "")}/api/oauth/microsoft/callback`
}

export type MicrosoftAvailability =
  | { available: true; redirectUri: string; scopes: string; tenant: string }
  | { available: false; message: string; redirectUri: string | null; docsPath: string; scopes: string }

function isTenant(value: string): boolean {
  return /^(common|organizations|consumers|[0-9a-f-]{36}|[a-z0-9.-]+\.[a-z]{2,})$/i.test(value)
}

function firstString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}
