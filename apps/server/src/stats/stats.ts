import { effectiveDailyCap, localIsoDate, rampDayNumber, rampLabel, rampPhase } from "./ramp.js";

/**
 * Stats math for spec §3.7.
 *
 * sent: successfully sent messages (failed sends are omitted).
 * replies: distinct contacts with a real reply. Auto-replies, delays, bounces and unmatched mail are omitted.
 * replyRate: replies / sent. Zero when nothing has been sent.
 * bounces: distinct contacts with a permanent bounce.
 * unsubscribes: distinct contacts.
 * stillInSequence: enrollments whose status is `active`.
 */
export const IN_SEQUENCE_STATUS = "active";

export interface OutboundMessage {
  campaignId: string;
  stepId: string;
  contactId: string;
  mailboxId: string;
  sentAt: string;
  status: "sent" | "failed";
}

export interface InboundStat {
  campaignId: string;
  stepId: string | null;
  contactId: string;
  kind: "reply" | "auto_reply" | "bounce" | "delivery_delay" | "unmatched";
}

export interface UnsubscribeStat {
  campaignId: string;
  /** 1-based step position. Null when the unsubscribe is only known at campaign level. */
  stepPosition: number | null;
  contactId: string;
}

export interface EnrollmentStat {
  campaignId: string;
  contactId: string;
  /** 1-based step position, matching `enrollments.current_step`. */
  currentStep: number;
  status: string;
}

export interface StatsData {
  outbound: readonly OutboundMessage[];
  inbound: readonly InboundStat[];
  unsubscribes: readonly UnsubscribeStat[];
  enrollments: readonly EnrollmentStat[];
}

export interface CountStats {
  sent: number;
  replies: number;
  replyRate: number;
  bounces: number;
  unsubscribes: number;
  stillInSequence: number;
}

export interface StepStats extends CountStats {
  stepId: string;
}

export interface CampaignStats extends CountStats {
  campaignId: string;
  steps: StepStats[];
}

export interface MailboxDayInput {
  mailboxId: string;
  email: string;
  configuredCap: number;
  rampStartedOn: string;
  today: string;
  sentToday: number;
  health: string;
  paused: boolean;
}

export interface MailboxDayStats {
  mailboxId: string;
  email: string;
  sentToday: number;
  configuredCap: number;
  effectiveCap: number;
  remaining: number;
  rampDay: number;
  rampPhase: ReturnType<typeof rampPhase>;
  rampLabel: string | null;
  overCap: boolean;
  health: string;
  paused: boolean;
}

function distinct(ids: Iterable<string>): number {
  return new Set(ids).size;
}

function rate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function countStats(input: {
  outbound: readonly OutboundMessage[];
  inbound: readonly InboundStat[];
  unsubscribes: readonly UnsubscribeStat[];
  enrollments: readonly EnrollmentStat[];
}): CountStats {
  const sent = input.outbound.filter((message) => message.status === "sent").length;
  const replies = distinct(input.inbound.filter((message) => message.kind === "reply").map((message) => message.contactId));
  const bounces = distinct(input.inbound.filter((message) => message.kind === "bounce").map((message) => message.contactId));
  const unsubscribes = distinct(input.unsubscribes.map((message) => message.contactId));
  const stillInSequence = input.enrollments.filter((enrollment) => enrollment.status === IN_SEQUENCE_STATUS).length;
  return {
    sent,
    replies,
    replyRate: rate(replies, sent),
    bounces,
    unsubscribes,
    stillInSequence,
  };
}

export function campaignStats(campaignId: string, steps: readonly { id: string; position: number }[], data: StatsData): CampaignStats {
  const outbound = data.outbound.filter((message) => message.campaignId === campaignId);
  const inbound = data.inbound.filter((message) => message.campaignId === campaignId);
  const unsubscribes = data.unsubscribes.filter((message) => message.campaignId === campaignId);
  const enrollments = data.enrollments.filter((enrollment) => enrollment.campaignId === campaignId);
  const stepStatsList = [...steps]
    .sort((a, b) => a.position - b.position)
    .map((step) => ({
      stepId: step.id,
      ...countStats({
        outbound: outbound.filter((message) => message.stepId === step.id),
        inbound: inbound.filter((message) => message.stepId === step.id),
        unsubscribes: unsubscribes.filter((message) => message.stepPosition === step.position),
        enrollments: enrollments.filter((enrollment) => enrollment.currentStep === step.position),
      }),
    }));
  return {
    campaignId,
    ...countStats({ outbound, inbound, unsubscribes, enrollments }),
    steps: stepStatsList,
  };
}

/** Successful sends whose mailbox-local calendar date is `today`. */
export function countSentOnLocalDay(
  messages: readonly Pick<OutboundMessage, "mailboxId" | "sentAt" | "status">[],
  mailboxId: string,
  today: string,
  timeZone: string,
): number {
  return messages.filter((message) => {
    if (message.mailboxId !== mailboxId || message.status !== "sent") return false;
    const sentAt = new Date(message.sentAt);
    if (Number.isNaN(sentAt.getTime())) return false;
    return localIsoDate(sentAt, timeZone) === today;
  }).length;
}

export function mailboxDayStats(input: MailboxDayInput): MailboxDayStats {
  const rampDay = rampDayNumber(input.rampStartedOn, input.today);
  const cap = effectiveDailyCap(input.configuredCap, rampDay);
  return {
    mailboxId: input.mailboxId,
    email: input.email,
    sentToday: input.sentToday,
    configuredCap: input.configuredCap,
    effectiveCap: cap,
    remaining: Math.max(0, cap - input.sentToday),
    rampDay,
    rampPhase: rampPhase(rampDay),
    rampLabel: rampLabel(rampDay, cap),
    overCap: input.sentToday > cap,
    health: input.health,
    paused: input.paused,
  };
}
