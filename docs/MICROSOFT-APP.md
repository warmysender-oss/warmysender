# Microsoft sign-in for a self-hosted WarmySender

WarmySender does not ship a Microsoft app. Each installation uses an app registration in the Microsoft Entra tenant of the person running the server. Mailbox refresh tokens stay on that server, encrypted at rest. They are not sent to WarmySender.

The redirect URL and scopes below are the ones the app sends. They have to match exactly.

- Redirect URL: `${PUBLIC_URL}/api/oauth/microsoft/callback`
- Example, when `PUBLIC_URL` is `https://mail.example.com`: `https://mail.example.com/api/oauth/microsoft/callback`
- Example, for a laptop: `http://localhost:3000/api/oauth/microsoft/callback`
- Scopes: `offline_access https://outlook.office.com/SMTP.Send https://outlook.office.com/IMAP.AccessAsUser.All openid email`

## 1. Register the app

1. Open the [Microsoft Entra admin center](https://entra.microsoft.com) and sign in.
2. Go to **Identity → Applications → App registrations** and choose **New registration**. Microsoft documents this screen in [Register an application](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app).
3. Name the app. `WarmySender` is fine.
4. Supported account types:
   - Choose **Accounts in any organizational directory and personal Microsoft accounts** when `MS_TENANT` is `common` (the default).
   - Choose **Accounts in this organizational directory only** when only one tenant will connect, and set `MS_TENANT` to that tenant id.
5. Under **Redirect URI**, choose platform **Web** and paste the redirect URL from the top of this page. It must match `PUBLIC_URL` character for character, including `http` versus `https` and any port.
6. Choose **Register**.
7. On the overview page, copy **Application (client) ID** into `MS_CLIENT_ID`.

## 2. Create a client secret

1. Open **Certificates & secrets → Client secrets → New client secret**.
2. Copy the **Value** immediately into `MS_CLIENT_SECRET`. The portal hides it later. Do not commit it and do not put it in a screenshot.
3. Secrets expire. When it expires, create a new one and restart the app. Existing refresh tokens keep working until Microsoft revokes them.

## 3. Add the Exchange and sign-in permissions

These are delegated permissions. A person signs in as themselves. Do not add the application permissions `SMTP.SendAsApp` or `IMAP.AccessAsApp`.

1. Open **API permissions → Add a permission**.
2. Open **APIs my organization uses**, search for **Office 365 Exchange Online**, and choose **Delegated permissions**.
3. Add `SMTP.Send` and `IMAP.AccessAsUser.All`.
4. Add a permission again, choose **Microsoft Graph → Delegated permissions**, and add `openid`, `email`, and `offline_access`.
5. If the tenant requires admin consent, choose **Grant admin consent**.

Microsoft's protocol note for these scopes is [Authenticate an IMAP, POP or SMTP connection using OAuth](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth). The authorization URL this app uses is `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` and the token URL is `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`.

## 4. Let the mailbox use SMTP and IMAP

Microsoft 365 mailboxes often have SMTP AUTH turned off.

1. Turn on **Authenticated SMTP** and **IMAP** for the mailbox in the Microsoft 365 admin center (user → Mail → Manage email apps).
2. If the tenant blocks SMTP AUTH, an admin has to allow it. Microsoft's steps are in [Enable SMTP AUTH](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission).

The app then connects with XOAUTH2:

- SMTP `smtp.office365.com` port `587` STARTTLS
- IMAP `outlook.office365.com` port `993` SSL

## 5. Configure the server

Put this in the environment, not in git:

```
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MS_TENANT=common
PUBLIC_URL=https://mail.example.com
```

`MS_TENANT` may be `common`, `organizations`, `consumers`, or a tenant id. Restart the app after changing them.

Open **Mailboxes** and choose **Sign in with Microsoft**. If a variable is missing, the button stays disabled and names the variables above.

## 6. DNS

Microsoft 365 DKIM uses CNAME records at `selector1._domainkey` and `selector2._domainkey`. The mailbox page looks those up. SPF for Microsoft 365 is a TXT record:

```
v=spf1 include:spf.protection.outlook.com -all
```

Publish one SPF record only. Microsoft's DKIM steps are in [How to use DKIM for email in a custom domain](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dkim-configure).
