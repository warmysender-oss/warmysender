/** Public WarmySender URLs. Shapes of the API itself come from the live OpenAPI document. */

export const WARMY_SENDER_API_BASE = "https://warmysender.com/api/v1";

/** Verified public page: https://warmysender.com/leads — the OpenAPI document has no leads path. */
export const LEADS_SEARCH_URL = "https://warmysender.com/leads";

/** Verified public guide. Sign-in for Microsoft mailboxes happens inside WarmySender. */
export const MICROSOFT_MAILBOX_URL =
  "https://warmysender.com/documentation/connect-microsoft-365-mailbox";

export const CONNECT_FEATURES = ["verify", "warmup", "leads"] as const;
export type ConnectFeature = (typeof CONNECT_FEATURES)[number];

export function connectUrl(feature: ConnectFeature): string {
  const url = new URL("https://warmysender.com/");
  url.searchParams.set("utm_source", "github");
  url.searchParams.set("utm_medium", "oss_app");
  url.searchParams.set("utm_campaign", feature);
  return url.toString();
}

export const WARMUP_CONFIRMATION =
  "The mailbox login is sent to WarmySender so it can warm the mailbox. WarmySender stores that login on your WarmySender account.";

export const MICROSOFT_WARMUP_MESSAGE =
  "Connect this mailbox in WarmySender to warm it up. That sign-in happens inside WarmySender.";

export const LEADS_IMPORT_MESSAGE =
  "Find leads in WarmySender, export a CSV, then import that CSV here. There is no public leads API.";
