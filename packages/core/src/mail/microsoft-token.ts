/** Spec §3.2. The mailbox screen and the sender share this list. */
export const MICROSOFT_SCOPES = [
  "offline_access",
  "https://outlook.office.com/SMTP.Send",
  "https://outlook.office.com/IMAP.AccessAsUser.All",
  "openid",
  "email",
] as const;

export type MicrosoftTokenEnv = {
  clientId?: string;
  clientSecret?: string;
  tenant?: string;
  publicUrl?: string;
  sessionSecret?: string;
};

export type MicrosoftAvailability =
  | { available: true; redirectUri: string; scopes: string; tenant: string }
  | { available: false; message: string; redirectUri: string | null; docsPath: string; scopes: string };

export type MicrosoftSecrets = {
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: string;
};

export type TokenRequest = {
  url: string;
  body: string;
  headers: { "content-type": string };
};

export function microsoftAvailability(env: MicrosoftTokenEnv): MicrosoftAvailability {
  const redirectUri = env.publicUrl ? redirectUriFromPublicUrl(env.publicUrl) : null;
  const scopes = MICROSOFT_SCOPES.join(" ");
  const missing: string[] = [];
  if (!env.clientId) missing.push("MS_CLIENT_ID");
  if (!env.clientSecret) missing.push("MS_CLIENT_SECRET");
  if (!env.sessionSecret) missing.push("SESSION_SECRET");
  if (!redirectUri) missing.push("PUBLIC_URL");
  const tenant = env.tenant?.trim() || "common";
  if (!isTenant(tenant)) {
    return {
      available: false,
      message: "MS_TENANT must be common, organizations, consumers, or your tenant id.",
      redirectUri,
      docsPath: "docs/MICROSOFT-APP.md",
      scopes,
    };
  }
  if (missing.length > 0) {
    const redirect = redirectUri ?? "${PUBLIC_URL}/api/oauth/microsoft/callback";
    return {
      available: false,
      message: `Sign in with Microsoft uses an Entra app you create yourself. Set ${missing.join(", ")} and restart. Register the redirect URL ${redirect} and the scopes ${scopes}. The steps are in docs/MICROSOFT-APP.md.`,
      redirectUri,
      docsPath: "docs/MICROSOFT-APP.md",
      scopes,
    };
  }
  return { available: true, redirectUri: redirectUri as string, scopes, tenant };
}

export function buildTokenRequest(input: {
  tenant: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  code?: string;
  refreshToken?: string;
}): TokenRequest {
  const params = new URLSearchParams();
  params.set("client_id", input.clientId);
  params.set("client_secret", input.clientSecret);
  params.set("scope", input.scopes);
  if (input.code) {
    params.set("grant_type", "authorization_code");
    params.set("code", input.code);
    params.set("redirect_uri", input.redirectUri);
  } else if (input.refreshToken) {
    params.set("grant_type", "refresh_token");
    params.set("refresh_token", input.refreshToken);
  } else {
    throw new Error("A Microsoft token request needs a code or a refresh token.");
  }
  return {
    url: `https://login.microsoftonline.com/${encodeURIComponent(input.tenant)}/oauth2/v2.0/token`,
    body: params.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  };
}

export function readTokenResponse(
  payload: unknown,
  now: Date,
  previousRefreshToken?: string,
):
  | { ok: true; accessToken: string; refreshToken: string; accessTokenExpiresAt: string; idToken: string | null }
  | { ok: false; message: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "Microsoft did not return a token. Try signing in again." };
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string") {
    return { ok: false, message: "Microsoft refused the sign-in. Check the Entra app secret and redirect URL, then try again." };
  }
  if (typeof record.access_token !== "string" || record.access_token.length === 0) {
    return { ok: false, message: "Microsoft did not return an access token. Try signing in again." };
  }
  const refreshToken =
    typeof record.refresh_token === "string" && record.refresh_token.length > 0
      ? record.refresh_token
      : previousRefreshToken;
  if (!refreshToken) {
    return {
      ok: false,
      message: "Microsoft did not return a refresh token. Confirm the app requests offline_access, then sign in again.",
    };
  }
  const expiresIn = typeof record.expires_in === "number" ? record.expires_in : 3600;
  return {
    ok: true,
    accessToken: record.access_token,
    refreshToken,
    accessTokenExpiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    idToken: typeof record.id_token === "string" ? record.id_token : null,
  };
}

export function accessTokenNeedsRefresh(expiresAtIso: string, now: Date, skewMs = 60_000): boolean {
  const expires = Date.parse(expiresAtIso);
  if (Number.isNaN(expires)) return true;
  return expires - now.getTime() <= skewMs;
}

export function redirectUriFromPublicUrl(publicUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(publicUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return `${publicUrl.replace(/\/+$/, "")}/api/oauth/microsoft/callback`;
}

/**
 * Returns the stored access token when it is still valid.
 * When it is expired or inside the skew window, exchanges the refresh token.
 * A failed refresh is an auth problem. An expired token that refreshes is not.
 */
export async function refreshMicrosoftSecrets(input: {
  secrets: MicrosoftSecrets;
  env: MicrosoftTokenEnv;
  now: Date;
  fetchToken: (request: TokenRequest) => Promise<unknown>;
}): Promise<{ ok: true; secrets: MicrosoftSecrets; refreshed: boolean } | { ok: false; message: string }> {
  if (!accessTokenNeedsRefresh(input.secrets.accessTokenExpiresAt, input.now)) {
    return { ok: true, secrets: input.secrets, refreshed: false };
  }
  const availability = microsoftAvailability(input.env);
  if (!availability.available || !input.env.clientId || !input.env.clientSecret) {
    return { ok: false, message: "Microsoft sign-in is not configured, so the access token cannot be refreshed." };
  }
  const request = buildTokenRequest({
    tenant: availability.tenant,
    clientId: input.env.clientId,
    clientSecret: input.env.clientSecret,
    redirectUri: availability.redirectUri,
    scopes: availability.scopes,
    refreshToken: input.secrets.refreshToken,
  });
  const token = readTokenResponse(await input.fetchToken(request), input.now, input.secrets.refreshToken);
  if (!token.ok) return token;
  return {
    ok: true,
    refreshed: true,
    secrets: {
      refreshToken: token.refreshToken,
      accessToken: token.accessToken,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
    },
  };
}

function isTenant(value: string): boolean {
  return /^(common|organizations|consumers|[0-9a-f-]{36}|[a-z0-9.-]+\.[a-z]{2,})$/i.test(value);
}
