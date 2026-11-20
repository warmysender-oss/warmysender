/** Same public URLs as the server module. A test locks the two copies together. */

export const LEADS_SEARCH_URL = "https://warmysender.com/leads";

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

export const FEATURE_COPY: Record<ConnectFeature, { title: string; summary: string }> = {
  verify: {
    title: "Verify a list",
    summary: "Check addresses with WarmySender and mark them valid, invalid, or risky before a campaign.",
  },
  warmup: {
    title: "Warm up a mailbox",
    summary: "Ask WarmySender to warm an SMTP mailbox. Microsoft mailboxes are connected inside WarmySender.",
  },
  leads: {
    title: "Find leads",
    summary: "Search WarmySender's lead database, export a CSV, and import it here.",
  },
};
