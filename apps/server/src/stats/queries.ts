import { eq, isNotNull } from "drizzle-orm";
import {
  campaignSteps,
  campaigns,
  contacts,
  enrollments,
  inboundMessages,
  mailboxes,
  messages,
  unsubscribeTokens,
  type AppDatabase,
} from "@warmysender/core";
import { localIsoDate } from "./ramp.js";
import { statsOverview, type StatsOverview } from "./overview.js";
import { countSentOnLocalDay, type StatsData } from "./stats.js";

export interface SetupCounts {
  mailboxCount: number;
  dnsCheckedMailboxCount: number;
  contactCount: number;
  campaignCount: number;
  demoCampaignAvailable: boolean;
}

export async function loadStatsOverview(db: AppDatabase, now = new Date()): Promise<StatsOverview> {
  const campaignRows = await db.select().from(campaigns);
  const stepRows = await db.select().from(campaignSteps);
  const messageRows = await db.select().from(messages);
  const inboundRows = await db
    .select({
      campaignId: messages.campaignId,
      stepId: messages.stepId,
      contactId: inboundMessages.contactId,
      kind: inboundMessages.kind,
    })
    .from(inboundMessages)
    .innerJoin(messages, eq(inboundMessages.matchedMessageId, messages.id));
  const tokenRows = await db
    .select({
      campaignId: unsubscribeTokens.campaignId,
      contactId: unsubscribeTokens.contactId,
      enrollmentId: unsubscribeTokens.enrollmentId,
    })
    .from(unsubscribeTokens)
    .where(isNotNull(unsubscribeTokens.usedAt));
  const enrollmentRows = await db.select().from(enrollments);
  const contactRows = await db.select().from(contacts);
  const mailboxRows = await db.select().from(mailboxes);
  const enrollmentStep = new Map(enrollmentRows.map((enrollment) => [enrollment.id, enrollment.currentStep]));

  const outbound = messageRows.map((message) => ({
    campaignId: message.campaignId,
    stepId: message.stepId ?? "",
    contactId: message.contactId,
    mailboxId: message.mailboxId,
    sentAt: (message.sentAt ?? message.createdAt).toISOString(),
    status: message.status === "sent" ? ("sent" as const) : ("failed" as const),
  }));

  const data: StatsData = {
    outbound,
    inbound: inboundRows.flatMap((row) => {
      if (!row.contactId) return [];
      const kind = row.kind === "reply" || row.kind === "auto_reply" || row.kind === "bounce" ? row.kind : "unmatched";
      return [{ campaignId: row.campaignId, stepId: row.stepId, contactId: row.contactId, kind }];
    }),
    unsubscribes: [
      ...tokenRows.flatMap((token) => {
        if (!token.campaignId) return [];
        return [
          {
            campaignId: token.campaignId,
            stepPosition: token.enrollmentId ? (enrollmentStep.get(token.enrollmentId) ?? null) : null,
            contactId: token.contactId,
          },
        ];
      }),
      ...enrollmentRows.flatMap((enrollment) => {
        const contact = contactRows.find((item) => item.id === enrollment.contactId);
        if (contact?.status !== "unsubscribed") return [];
        return [
          {
            campaignId: enrollment.campaignId,
            stepPosition: enrollment.currentStep,
            contactId: enrollment.contactId,
          },
        ];
      }),
    ],
    enrollments: enrollmentRows.map((enrollment) => ({
      campaignId: enrollment.campaignId,
      contactId: enrollment.contactId,
      currentStep: enrollment.currentStep,
      status: enrollment.status,
    })),
  };

  return statsOverview({
    campaigns: campaignRows.map((campaign) => ({ id: campaign.id, name: campaign.name })),
    steps: stepRows.map((step) => ({ id: step.id, campaignId: step.campaignId, position: step.position })),
    data,
    mailboxes: mailboxRows.map((mailbox) => {
      const today = localIsoDate(now, mailbox.timezone);
      return {
        mailboxId: mailbox.id,
        email: mailbox.email,
        configuredCap: mailbox.dailyCap,
        rampStartedOn: mailbox.rampStartedOn,
        today,
        sentToday: countSentOnLocalDay(outbound, mailbox.id, today, mailbox.timezone),
        health: mailbox.health,
        paused: mailbox.health === "paused",
      };
    }),
  });
}

/**
 * Deliverability is computed when someone opens a mailbox. `mailboxes` has no stored DNS result,
 * so the first-run DNS step stays open.
 * A campaign counts as the demo when every enrolled contact uses a `.test` address.
 */
export async function loadSetup(db: AppDatabase): Promise<SetupCounts> {
  const campaignRows = await db.select().from(campaigns);
  const contactRows = await db.select().from(contacts);
  const enrollmentRows = await db.select().from(enrollments);
  const mailboxRows = await db.select().from(mailboxes);
  const contactEmail = new Map(contactRows.map((contact) => [contact.id, contact.email]));
  const demoCampaignAvailable = campaignRows.some((campaign) => {
    const enrolled = enrollmentRows.filter((enrollment) => enrollment.campaignId === campaign.id);
    if (enrolled.length === 0) return false;
    return enrolled.every((enrollment) => (contactEmail.get(enrollment.contactId) ?? "").endsWith(".test"));
  });
  return {
    mailboxCount: mailboxRows.length,
    dnsCheckedMailboxCount: 0,
    contactCount: contactRows.length,
    campaignCount: campaignRows.length,
    demoCampaignAvailable,
  };
}
