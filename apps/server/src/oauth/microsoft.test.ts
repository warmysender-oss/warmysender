import { describe, expect, it } from "vitest"
import { buildXoauth2InitialResponse } from "./xoauth2.js"
import {
  accessTokenNeedsRefresh,
  buildAuthorizeUrl,
  buildTokenRequest,
  emailFromIdToken,
  microsoftAvailability,
  refreshMicrosoftSecrets,
  signOAuthState,
  verifyOAuthState,
} from "./microsoft.js"

describe("Microsoft OAuth", () => {
  it("explains how to create the Entra app when the env is missing", () => {
    const availability = microsoftAvailability({ publicUrl: "https://mail.example.com/" })
    expect(availability.available).toBe(false)
    if (availability.available) return
    expect(availability.message).toContain("docs/MICROSOFT-APP.md")
    expect(availability.redirectUri).toBe("https://mail.example.com/api/oauth/microsoft/callback")
    expect(availability.scopes).toContain("https://outlook.office.com/IMAP.AccessAsUser.All")
  })

  it("signs state, builds the token request, and reads the mailbox address", () => {
    const state = signOAuthState("session-secret", 1_000, "nonce")
    expect(verifyOAuthState(state, "session-secret", 1_000).ok).toBe(true)
    expect(verifyOAuthState(state, "other-secret", 1_000).ok).toBe(false)
    expect(verifyOAuthState(state, "session-secret", 1_000 + 11 * 60 * 1000).ok).toBe(false)

    const url = buildAuthorizeUrl({
      clientId: "client-id",
      tenant: "common",
      redirectUri: "https://mail.example.com/api/oauth/microsoft/callback",
      state,
      scopes: "offline_access openid email",
    })
    expect(url.startsWith("https://login.microsoftonline.com/common/oauth2/v2.0/authorize?")).toBe(true)

    const request = buildTokenRequest({
      tenant: "common",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://mail.example.com/api/oauth/microsoft/callback",
      scopes: "offline_access",
      code: "auth-code",
    })
    expect(request.url).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token")
    expect(request.body).toContain("grant_type=authorization_code")
    expect(request.body).toContain("client_secret=client-secret")

    const idToken = `h.${Buffer.from(JSON.stringify({ preferred_username: "Ada@Harbor-Dental.test" })).toString("base64url")}.s`
    expect(emailFromIdToken(idToken)).toBe("ada@harbor-dental.test")
    expect(accessTokenNeedsRefresh(new Date(1_000).toISOString(), new Date(2_000))).toBe(true)
  })
})

describe("Microsoft token refresh", () => {
  it("refreshes an expired access token and keeps the previous refresh token", async () => {
    let calls = 0
    const result = await refreshMicrosoftSecrets({
      secrets: {
        refreshToken: "refresh-1",
        accessToken: "old-access",
        accessTokenExpiresAt: new Date(0).toISOString(),
      },
      env: {
        clientId: "client-id",
        clientSecret: "client-secret",
        publicUrl: "https://mail.example.com",
        sessionSecret: "session-secret",
      },
      now: new Date("2026-01-03T15:00:00.000Z"),
      async fetchToken(request) {
        calls += 1
        expect(request.body).toContain("grant_type=refresh_token")
        expect(request.body).toContain("refresh_token=refresh-1")
        return { access_token: "new-access", expires_in: 100 }
      },
    })
    expect(calls).toBe(1)
    expect(result).toMatchObject({
      ok: true,
      refreshed: true,
      secrets: { accessToken: "new-access", refreshToken: "refresh-1" },
    })
  })
})

describe("XOAUTH2", () => {
  it("builds the SASL initial response", () => {
    const encoded = buildXoauth2InitialResponse("ada@harbor-dental.test", "token-1")
    expect(Buffer.from(encoded, "base64").toString("utf8")).toBe("user=ada@harbor-dental.test\u0001auth=Bearer token-1\u0001\u0001")
  })
})
