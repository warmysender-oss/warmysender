# Microsoft 365 / Outlook app

This is the stub for the self-hoster's own Entra app. Mailbox connect, XOAUTH2, and the in-app button are the mailbox task. The button points here when `MS_CLIENT_ID` and `MS_CLIENT_SECRET` are unset.

The app signs the mailbox user in with that Entra app and stores the refresh token encrypted. You create the app in your own tenant. WarmySender does not ship a shared Microsoft client id.

## Values the server reads

| Variable | Value |
| --- | --- |
| `MS_CLIENT_ID` | Application (client) ID from the app registration |
| `MS_CLIENT_SECRET` | A client secret from that registration |
| `MS_TENANT` | Directory. Leave it unset to use `common` |

## Redirect URL

Register a **Web** redirect URI that matches this string, with your real `PUBLIC_URL` substituted:

```text
${PUBLIC_URL}/api/oauth/microsoft/callback
```

A local Compose install with `PUBLIC_URL=http://localhost:3000` registers:

```text
http://localhost:3000/api/oauth/microsoft/callback
```

Microsoft only returns the user to a redirect URI that is listed on the app. The scheme, host, port, and path all have to match. Source: https://learn.microsoft.com/en-us/entra/identity-platform/reply-url

## Scopes

The sign-in requests these scopes:

```text
offline_access https://outlook.office.com/SMTP.Send https://outlook.office.com/IMAP.AccessAsUser.All openid email
```

Microsoft's IMAP/SMTP OAuth document uses the same Outlook resource scopes for IMAP and SMTP AUTH, and `offline_access` so the app can receive a refresh token: https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth

Add those as **delegated** permissions for the signed-in user (Office 365 Exchange Online delegated `IMAP.AccessAsUser.All` and `SMTP.Send`, plus `offline_access`, `openid`, and `email`). The application permissions later on that same Microsoft page (`IMAP.AccessAsApp`, `SMTP.SendAsApp`) belong to the client-credentials flow. This app uses the delegated scopes above.

## Create the registration

1. Open the Microsoft Entra admin center → **App registrations** → **New registration**. https://learn.microsoft.com/en-us/graph/auth-register-app-v2
2. Name the app.
3. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** matches the default tenant `common`. A single-directory app needs `MS_TENANT` set to that directory's tenant id.
4. Under **Redirect URI**, choose platform **Web** and paste `${PUBLIC_URL}/api/oauth/microsoft/callback`. You can also add it later: **Authentication** → **Add a platform** → **Web**. https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri
5. Register. Copy the **Application (client) ID** into `MS_CLIENT_ID`.
6. **Certificates & secrets** → **New client secret**. Copy the secret value into `MS_CLIENT_SECRET`. The portal shows it once.
7. **API permissions** → add the delegated scopes in the [Scopes](#scopes) section.
8. Put the three variables in `.env` and restart the `app` service. The mailbox page can then offer **Sign in with Microsoft**.
