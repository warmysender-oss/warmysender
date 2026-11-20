import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { OAUTH_STATE_TTL_MS } from "./microsoft-config.js"

export {
  accessTokenNeedsRefresh,
  buildTokenRequest,
  microsoftAvailability,
  readTokenResponse,
  redirectUriFromPublicUrl,
  refreshMicrosoftSecrets,
} from "@warmysender/core"
export type { MicrosoftAvailability } from "@warmysender/core"

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

function firstString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}
