import { campaignStats, mailboxDayStats, type CampaignStats, type MailboxDayInput, type MailboxDayStats, type StatsData } from "./stats.js";

export interface StatsSnapshot {
  campaigns: Array<{ id: string; name: string }>;
  steps: Array<{ id: string; campaignId: string; position: number }>;
  data: StatsData;
  mailboxes: MailboxDayInput[];
}

export interface StatsOverview {
  campaigns: Array<CampaignStats & { name: string }>;
  mailboxes: MailboxDayStats[];
}

export function statsOverview(snapshot: StatsSnapshot): StatsOverview {
  return {
    campaigns: snapshot.campaigns.map((campaign) => ({
      name: campaign.name,
      ...campaignStats(
        campaign.id,
        snapshot.steps.filter((step) => step.campaignId === campaign.id),
        snapshot.data,
      ),
    })),
    mailboxes: snapshot.mailboxes.map((mailbox) => mailboxDayStats(mailbox)),
  };
}
