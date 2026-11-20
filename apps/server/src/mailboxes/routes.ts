import { checkDeliverability, type DnsResolver } from "../../../../packages/core/src/dns/index.js"
import {
  clearAuthPause,
  MICROSOFT_IMAP,
  MICROSOFT_SMTP,
  spfExampleForPreset,
  type SecretCodec,
} from "../../../../packages/core/src/mail/index.js"
import {
  createSmtpMailbox,
  listMailboxViews,
  microsoftRecordFromToken,
  reconnectSmtpMailbox,
  testStoredMailbox,
  toMailboxView,
  updateMailbox,
} from "./service.js"
import type { MailboxProbes } from "./test-connection.js"
import type { MailboxStore } from "./types.js"
import { listPresets } from "../../../../packages/core/src/mail/presets.js"
import {
  buildAuthorizeUrl,
  buildTokenRequest,
  emailFromIdToken,
  microsoftAvailability,
  nameFromIdToken,
  readTokenResponse,
  refreshMicrosoftSecrets,
  signOAuthState,
  verifyOAuthState,
} from "../oauth/microsoft.js"
import { readMicrosoftEnv, type MicrosoftEnv } from "../oauth/microsoft-config.js"

export type RouteRequest = {
  method: string
  path: string
  query: Record<string, string | undefined>
  body: unknown
  userId: string | null
}

export type RouteResponse = {
  status: number
  body?: unknown
  redirect?: string
}

export type MailHttpDeps = {
  store: MailboxStore
  codec: SecretCodec
  probes: MailboxProbes
  resolver: DnsResolver
  now: () => Date
  env: () => MicrosoftEnv
  fetchToken: (request: { url: string; body: string; headers: { "content-type": string } }) => Promise<unknown>
}

export async function handleMailHttp(request: RouteRequest, deps: MailHttpDeps): Promise<RouteResponse> {
  const method = request.method.toUpperCase()
  const path = request.path.replace(/\/+$/, "") || "/"

  if (method === "GET" && path === "/api/mailboxes/presets") {
    return requireUser(request, () => ({ status: 200, body: { presets: listPresets() } }))
  }
  if (method === "GET" && path === "/api/oauth/microsoft/availability") {
    const availability = microsoftAvailability(deps.env())
    return { status: 200, body: availability }
  }
  if (method === "GET" && path === "/api/oauth/microsoft/start") {
    return requireUser(request, () => startMicrosoft(deps))
  }
  if (method === "GET" && path === "/api/oauth/microsoft/callback") {
    return finishMicrosoft(request, deps)
  }
  if (method === "GET" && path === "/api/mailboxes") {
    return requireUser(request, async () => ({ status: 200, body: { mailboxes: await listMailboxViews(deps.store, deps.now()) } }))
  }
  if (method === "POST" && path === "/api/mailboxes") {
    return requireUser(request, async () => {
      const created = await createSmtpMailbox(request.body, { store: deps.store, codec: deps.codec, now: deps.now() })
      if (!created.ok) return result(created)
      return { status: 200, body: { mailbox: created.value } }
    })
  }

  const deliverabilityId = path.match(/^\/api\/mailboxes\/([^/]+)\/deliverability$/)?.[1]
  if (method === "GET" && deliverabilityId) {
    return requireUser(request, () => mailboxDeliverability(deliverabilityId, deps))
  }
  const testId = path.match(/^\/api\/mailboxes\/([^/]+)\/test$/)?.[1]
  if (method === "POST" && testId) {
    return requireUser(request, async () => {
      const ready = await refreshStoredMicrosoftToken(testId, deps)
      if (!ready.ok) return result(ready)
      const connection = await testStoredMailbox(testId, {
        store: deps.store,
        codec: deps.codec,
        probes: deps.probes,
        accessToken: ready.accessToken,
      })
      if (!connection.ok) return result(connection)
      return { status: 200, body: { connection: connection.value } }
    })
  }
  const reconnectId = path.match(/^\/api\/mailboxes\/([^/]+)\/reconnect$/)?.[1]
  if (method === "POST" && reconnectId) {
    return requireUser(request, async () => {
      const mailbox = await deps.store.findById(reconnectId)
      if (mailbox?.provider === "microsoft") {
        const start = startMicrosoft(deps)
        return start
      }
      const updated = await reconnectSmtpMailbox(reconnectId, request.body, {
        store: deps.store,
        codec: deps.codec,
        now: deps.now(),
        probes: deps.probes,
      })
      return result(updated)
    })
  }
  const oneId = path.match(/^\/api\/mailboxes\/([^/]+)$/)?.[1]
  if (oneId && method === "GET") {
    return requireUser(request, async () => {
      const mailbox = await deps.store.findById(oneId)
      if (!mailbox) return { status: 404, body: { errors: [{ field: "id", message: "Mailbox not found." }] } }
      return { status: 200, body: { mailbox: toMailboxView(mailbox, deps.now()) } }
    })
  }
  if (oneId && method === "PATCH") {
    return requireUser(request, async () => {
      const updated = await updateMailbox(oneId, request.body, { store: deps.store, codec: deps.codec, now: deps.now() })
      if (!updated.ok) return result(updated)
      return { status: 200, body: { mailbox: updated.value } }
    })
  }
  return { status: 404, body: { errors: [{ field: "path", message: "Not found." }] } }
}

async function refreshStoredMicrosoftToken(
  id: string,
  deps: MailHttpDeps,
): Promise<{ ok: true; accessToken?: string } | { ok: false; status: number; errors: { field: string; message: string }[] }> {
  const mailbox = await deps.store.findById(id)
  if (!mailbox) return { ok: false, status: 404, errors: [{ field: "id", message: "Mailbox not found." }] }
  if (mailbox.provider !== "microsoft") return { ok: true }
  if (!mailbox.oauthRefreshTokenEncrypted || !mailbox.oauthAccessTokenEncrypted || !mailbox.oauthAccessTokenExpiresAt) {
    return { ok: false, status: 422, errors: [{ field: "connection", message: "This Microsoft mailbox has no refresh token. Sign in again." }] }
  }
  const refreshed = await refreshMicrosoftSecrets({
    secrets: {
      refreshToken: deps.codec.decrypt(mailbox.oauthRefreshTokenEncrypted),
      accessToken: deps.codec.decrypt(mailbox.oauthAccessTokenEncrypted),
      accessTokenExpiresAt: mailbox.oauthAccessTokenExpiresAt,
    },
    env: deps.env(),
    now: deps.now(),
    fetchToken: deps.fetchToken,
  })
  if (!refreshed.ok) return { ok: false, status: 422, errors: [{ field: "connection", message: refreshed.message }] }
  if (refreshed.refreshed) {
    await deps.store.update(id, {
      oauthRefreshTokenEncrypted: deps.codec.encrypt(refreshed.secrets.refreshToken),
      oauthAccessTokenEncrypted: deps.codec.encrypt(refreshed.secrets.accessToken),
      oauthAccessTokenExpiresAt: refreshed.secrets.accessTokenExpiresAt,
      updatedAt: deps.now().toISOString(),
    })
  }
  return { ok: true, accessToken: refreshed.secrets.accessToken }
}

async function mailboxDeliverability(id: string, deps: MailHttpDeps): Promise<RouteResponse> {
  const mailbox = await deps.store.findById(id)
  if (!mailbox) return { status: 404, body: { errors: [{ field: "id", message: "Mailbox not found." }] } }
  const report = await checkDeliverability(mailbox.email, deps.resolver, spfExampleForPreset(mailbox.provider))
  return { status: 200, body: { deliverability: report } }
}

function startMicrosoft(deps: MailHttpDeps): RouteResponse {
  const env = deps.env()
  const availability = microsoftAvailability(env)
  if (!availability.available) return { status: 400, body: availability }
  if (!env.clientId || !env.sessionSecret) {
    return { status: 400, body: availability }
  }
  const state = signOAuthState(env.sessionSecret, deps.now().getTime())
  const redirect = buildAuthorizeUrl({
    clientId: env.clientId,
    tenant: availability.tenant,
    redirectUri: availability.redirectUri,
    state,
    scopes: availability.scopes,
  })
  return { status: 302, redirect }
}

async function finishMicrosoft(request: RouteRequest, deps: MailHttpDeps): Promise<RouteResponse> {
  const env = deps.env()
  const availability = microsoftAvailability(env)
  if (!availability.available || !env.clientId || !env.clientSecret || !env.sessionSecret) {
    return redirectMailboxes("microsoft=not-configured")
  }
  const state = request.query.state ?? ""
  const verified = verifyOAuthState(state, env.sessionSecret, deps.now().getTime())
  if (!verified.ok) return redirectMailboxes("microsoft=state")
  if (request.query.error) return redirectMailboxes("microsoft=denied")
  const code = request.query.code
  if (!code) return redirectMailboxes("microsoft=missing-code")
  const tokenRequest = buildTokenRequest({
    tenant: availability.tenant,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    redirectUri: availability.redirectUri,
    scopes: availability.scopes,
    code,
  })
  const payload = await deps.fetchToken(tokenRequest)
  const token = readTokenResponse(payload, deps.now())
  if (!token.ok || !token.idToken) return redirectMailboxes("microsoft=token")
  const email = emailFromIdToken(token.idToken)
  if (!email) return redirectMailboxes("microsoft=missing-email")
  const existing = await deps.store.findByEmail(email)
  const now = deps.now()
  if (existing) {
    const health = clearAuthPause()
    await deps.store.update(existing.id, {
      provider: "microsoft",
      smtpHost: MICROSOFT_SMTP.host,
      smtpPort: MICROSOFT_SMTP.port,
      smtpSecurity: MICROSOFT_SMTP.security,
      smtpUsername: email,
      imapHost: MICROSOFT_IMAP.host,
      imapPort: MICROSOFT_IMAP.port,
      imapSecurity: MICROSOFT_IMAP.security,
      imapUsername: email,
      ...health,
      oauthRefreshTokenEncrypted: deps.codec.encrypt(token.refreshToken),
      oauthAccessTokenEncrypted: deps.codec.encrypt(token.accessToken),
      oauthAccessTokenExpiresAt: token.accessTokenExpiresAt,
      updatedAt: now.toISOString(),
    })
  } else {
    const fromName = nameFromIdToken(token.idToken) ?? email
    await deps.store.insert(
      microsoftRecordFromToken({
        email,
        fromName,
        refreshToken: token.refreshToken,
        accessToken: token.accessToken,
        accessTokenExpiresAt: token.accessTokenExpiresAt,
        now,
        codec: deps.codec,
        timeZone: "UTC",
      }),
    )
  }
  return redirectMailboxes("microsoft=connected")
}

function redirectMailboxes(query: string): RouteResponse {
  return { status: 302, redirect: `/mailboxes?${query}` }
}

function requireUser(request: RouteRequest, run: () => RouteResponse | Promise<RouteResponse>): Promise<RouteResponse> | RouteResponse {
  if (!request.userId) return { status: 401, body: { errors: [{ field: "session", message: "Sign in first." }] } }
  return run()
}

function result(value: { ok: true; value: unknown } | { ok: false; status: number; errors: { field: string; message: string }[]; connection?: unknown }): RouteResponse {
  if (!value.ok) {
    return { status: value.status, body: { errors: value.errors, connection: value.connection } }
  }
  return { status: 200, body: value.value }
}

export function microsoftEnvFromProcess(env: Record<string, string | undefined> = process.env): MicrosoftEnv {
  return readMicrosoftEnv(env)
}
