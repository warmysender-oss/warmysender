/**
 * Selectors published by the mailbox providers this app presets.
 * Google Workspace default TXT: google._domainkey (Google Admin → Authenticate email).
 * Microsoft 365 CNAME: selector1 and selector2
 *   https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dkim-configure
 * Zoho's admin example selector is "zoho" (the admin can choose another name)
 *   https://www.zoho.com/mail/help/adminconsole/dkim-configuration.html
 * Hostinger Email CNAME: hostingermail-a/b/c
 *   https://www.hostinger.com/support/4456413-what-are-the-dkim-records-for-hostinger-email/
 * Fastmail CNAME: fm1, fm2, fm3
 *   https://www.fastmail.help/hc/en-us/articles/360060591153-Manual-DNS-configuration
 */
export const DKIM_SELECTORS = [
  "google",
  "selector1",
  "selector2",
  "zoho",
  "hostingermail-a",
  "hostingermail-b",
  "hostingermail-c",
  "fm1",
  "fm2",
  "fm3",
] as const

export type DkimSelector = (typeof DKIM_SELECTORS)[number]

export function dkimHost(selector: string, domain: string): string {
  return `${selector}._domainkey.${domain}`
}
