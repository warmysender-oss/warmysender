import type { MailPreset, MailPresetId, ServerEndpoint } from "./types.js"

/**
 * Hosts, ports, and SPF examples are the vendors' published settings:
 * - Gmail: https://developers.google.com/workspace/gmail/imap/imap-smtp
 * - Zoho: https://www.zoho.com/mail/help/imap-access.html and https://www.zoho.com/mail/help/adminconsole/spf-configuration.html
 * - Hostinger: https://www.hostinger.com/support/1575756-how-to-get-email-account-configuration-details-for-hostinger-email/
 * - Fastmail: https://www.fastmail.help/hc/en-us/articles/1500000278342-Server-names-and-ports
 *   and https://www.fastmail.help/hc/en-us/articles/360060591153-Manual-DNS-configuration
 * - Microsoft: https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission
 */
export const MAIL_PRESETS: readonly MailPreset[] = [
  {
    id: "gmail",
    label: "Gmail",
    smtp: { host: "smtp.gmail.com", port: 587, security: "starttls" },
    imap: { host: "imap.gmail.com", port: 993, security: "ssl" },
    usernameIsEmail: true,
    help: "Use a Google App Password, not your normal Gmail password. Turn on 2-Step Verification, create an app password, and turn on IMAP in Gmail settings.",
    spfExample: "v=spf1 include:_spf.google.com ~all",
    docsUrl: "https://support.google.com/accounts/answer/185833",
  },
  {
    id: "google-workspace",
    label: "Google Workspace",
    smtp: { host: "smtp.gmail.com", port: 587, security: "starttls" },
    imap: { host: "imap.gmail.com", port: 993, security: "ssl" },
    usernameIsEmail: true,
    help: "Use a Google App Password for this mailbox. An admin may need to allow IMAP and SMTP in the Google Admin console.",
    spfExample: "v=spf1 include:_spf.google.com ~all",
    docsUrl: "https://developers.google.com/workspace/gmail/imap/imap-smtp",
  },
  {
    id: "zoho",
    label: "Zoho",
    smtp: { host: "smtp.zoho.com", port: 465, security: "ssl" },
    imap: { host: "imap.zoho.com", port: 993, security: "ssl" },
    usernameIsEmail: true,
    help: "Turn on IMAP in Zoho Mail settings. If two-factor authentication is on, use an application-specific password. Paid organization mail (you@yourdomain.com) uses smtppro.zoho.com and imappro.zoho.com — change the hosts if Zoho shows those in Settings → Mail Accounts.",
    spfExample: "v=spf1 include:zohomail.com ~all",
    docsUrl: "https://www.zoho.com/mail/help/imap-access.html",
  },
  {
    id: "hostinger",
    label: "Hostinger",
    smtp: { host: "smtp.hostinger.com", port: 465, security: "ssl" },
    imap: { host: "imap.hostinger.com", port: 993, security: "ssl" },
    usernameIsEmail: true,
    help: "Use the full mailbox address as the username. If the mailbox has two-factor authentication, use an app password. If SMTP on port 465 fails, try port 587 with STARTTLS.",
    spfExample: null,
    docsUrl: "https://www.hostinger.com/support/1575756-how-to-get-email-account-configuration-details-for-hostinger-email/",
  },
  {
    id: "fastmail",
    label: "Fastmail",
    smtp: { host: "smtp.fastmail.com", port: 465, security: "ssl" },
    imap: { host: "imap.fastmail.com", port: 993, security: "ssl" },
    usernameIsEmail: true,
    help: "Fastmail requires an app password. Basic plans do not include IMAP or SMTP.",
    spfExample: "v=spf1 include:spf.messagingengine.com ?all",
    docsUrl: "https://www.fastmail.help/hc/en-us/articles/1500000278342-Server-names-and-ports",
  },
  {
    id: "custom",
    label: "Custom",
    smtp: { host: "", port: 587, security: "starttls" },
    imap: { host: "", port: 993, security: "ssl" },
    usernameIsEmail: true,
    help: "Enter the SMTP and IMAP servers from your email host.",
    spfExample: null,
    docsUrl: null,
  },
]

export const MICROSOFT_SMTP: ServerEndpoint = {
  host: "smtp.office365.com",
  port: 587,
  security: "starttls",
}

export const MICROSOFT_IMAP: ServerEndpoint = {
  host: "outlook.office365.com",
  port: 993,
  security: "ssl",
}

export function listPresets(): MailPreset[] {
  return MAIL_PRESETS.map((preset) => ({ ...preset, smtp: { ...preset.smtp }, imap: { ...preset.imap } }))
}

export function findPreset(id: string): MailPreset | null {
  return listPresets().find((preset) => preset.id === id) ?? null
}

export function spfExampleForPreset(id: string | null | undefined): string | null {
  if (id === "microsoft") return "v=spf1 include:spf.protection.outlook.com -all"
  const preset = MAIL_PRESETS.find((item) => item.id === id)
  return preset?.spfExample ?? null
}
