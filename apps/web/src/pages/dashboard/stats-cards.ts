export interface CampaignCardInput {
  name: string;
  sent: number;
  replies: number;
  replyRate: number;
  bounces: number;
  unsubscribes: number;
  stillInSequence: number;
}

export interface StatCard {
  label: string;
  value: string;
}

export function formatReplyRate(replyRate: number): string {
  if (!Number.isFinite(replyRate)) return "0.0%";
  return `${(replyRate * 100).toFixed(1)}%`;
}

export function campaignStatCards(input: CampaignCardInput): StatCard[] {
  return [
    { label: "Sent", value: String(input.sent) },
    { label: "Replies", value: String(input.replies) },
    { label: "Reply rate", value: formatReplyRate(input.replyRate) },
    { label: "Bounces", value: String(input.bounces) },
    { label: "Unsubscribes", value: String(input.unsubscribes) },
    { label: "Still in sequence", value: String(input.stillInSequence) },
  ];
}

export interface MailboxCardInput {
  email: string;
  sentToday: number;
  effectiveCap: number;
  rampLabel: string | null;
  health: string;
  paused: boolean;
}

export function mailboxStatLine(input: MailboxCardInput): {
  title: string;
  usage: string;
  ramp: string | null;
  health: string;
  paused: boolean;
} {
  return {
    title: input.email,
    usage: `${input.sentToday} / ${input.effectiveCap} today`,
    ramp: input.rampLabel,
    health: input.health,
    paused: input.paused,
  };
}
