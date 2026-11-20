import { asc, eq, inArray } from "drizzle-orm";
import {
  campaignAudienceContacts,
  campaignAudienceLists,
  campaignMailboxes,
  campaignSteps,
  campaigns,
  enrollments,
  mailboxes,
  type AppDatabase,
  type CampaignState,
} from "@warmysender/core";
import type { CampaignRecord, CampaignStore, EnrollmentRecord, StepRecord } from "./types.js";

export function createDrizzleCampaignStore(db: AppDatabase): CampaignStore {
  return {
    async listCampaigns() {
      const rows = await db.select().from(campaigns);
      const details: CampaignRecord[] = [];
      for (const row of rows) details.push(await hydrate(db, row));
      return details;
    },
    async getCampaign(id) {
      const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
      return row ? hydrate(db, row) : null;
    },
    async insertCampaign(row) {
      await db.insert(campaigns).values({
        id: row.id,
        name: row.name,
        status: row.state,
        createdBy: row.createdBy,
      });
      await replaceLinks(db, row);
    },
    async updateCampaign(row) {
      const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, row.id)).limit(1);
      if (!existing) return;
      const launchedAt =
        row.state === "running" && !existing.launchedAt ? new Date() : existing.launchedAt;
      await db
        .update(campaigns)
        .set({
          name: row.name,
          status: row.state,
          launchedAt,
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, row.id));
      await replaceLinks(db, row);
    },
    async deleteCampaign(id) {
      await db.delete(campaigns).where(eq(campaigns.id, id));
    },
    async listSteps(campaignId) {
      const rows = await db
        .select()
        .from(campaignSteps)
        .where(eq(campaignSteps.campaignId, campaignId))
        .orderBy(asc(campaignSteps.position));
      return rows.map(toStep);
    },
    async insertStep(row) {
      await db.insert(campaignSteps).values(stepValues(row));
    },
    async updateStep(row) {
      const values = stepValues(row);
      await db
        .update(campaignSteps)
        .set({
          position: values.position,
          subject: values.subject,
          body: values.body,
          delayDays: values.delayDays,
          isHtml: values.isHtml,
          updatedAt: new Date(),
        })
        .where(eq(campaignSteps.id, row.id));
    },
    async deleteStep(id) {
      await db.delete(campaignSteps).where(eq(campaignSteps.id, id));
    },
    async deleteStepsForCampaign(campaignId) {
      await db.delete(campaignSteps).where(eq(campaignSteps.campaignId, campaignId));
    },
    async listEnrollments(campaignId) {
      const rows = await db.select().from(enrollments).where(eq(enrollments.campaignId, campaignId));
      return rows.map(toEnrollment);
    },
    async insertEnrollments(rows) {
      if (rows.length === 0) return;
      await db.insert(enrollments).values(
        rows.map((row) => ({
          id: row.id,
          campaignId: row.campaignId,
          contactId: row.contactId,
          status: row.status,
          currentStep: row.currentStep,
          nextSendAt: row.nextSendAt ? new Date(row.nextSendAt) : null,
          mailboxId: row.mailboxId,
        })),
      );
    },
    async deleteEnrollmentsForCampaign(campaignId) {
      await db.delete(enrollments).where(eq(enrollments.campaignId, campaignId));
    },
    async listMailboxes(ids) {
      if (ids.length === 0) return [];
      const rows = await db
        .select({ id: mailboxes.id, email: mailboxes.email, health: mailboxes.health })
        .from(mailboxes)
        .where(inArray(mailboxes.id, ids));
      return rows.map((row) => ({
        id: row.id,
        address: row.email,
        paused: row.health === "paused",
      }));
    },
  };
}

async function hydrate(db: AppDatabase, row: typeof campaigns.$inferSelect): Promise<CampaignRecord> {
  const [mailboxRows, contactRows, listRows] = await Promise.all([
    db
      .select()
      .from(campaignMailboxes)
      .where(eq(campaignMailboxes.campaignId, row.id))
      .orderBy(asc(campaignMailboxes.createdAt)),
    db.select().from(campaignAudienceContacts).where(eq(campaignAudienceContacts.campaignId, row.id)),
    db.select().from(campaignAudienceLists).where(eq(campaignAudienceLists.campaignId, row.id)),
  ]);
  return {
    id: row.id,
    name: row.name,
    state: asState(row.status),
    createdBy: row.createdBy,
    mailboxIds: mailboxRows.map((item) => item.mailboxId),
    contactIds: contactRows.map((item) => item.contactId),
    listIds: listRows.map((item) => item.listId),
  };
}

async function replaceLinks(db: AppDatabase, row: CampaignRecord): Promise<void> {
  await db.delete(campaignMailboxes).where(eq(campaignMailboxes.campaignId, row.id));
  await db.delete(campaignAudienceContacts).where(eq(campaignAudienceContacts.campaignId, row.id));
  await db.delete(campaignAudienceLists).where(eq(campaignAudienceLists.campaignId, row.id));
  const base = Date.now();
  if (row.mailboxIds.length > 0) {
    await db.insert(campaignMailboxes).values(
      row.mailboxIds.map((mailboxId, index) => ({
        campaignId: row.id,
        mailboxId,
        createdAt: new Date(base + index),
      })),
    );
  }
  if (row.contactIds.length > 0) {
    await db.insert(campaignAudienceContacts).values(
      row.contactIds.map((contactId) => ({ campaignId: row.id, contactId })),
    );
  }
  if (row.listIds.length > 0) {
    await db.insert(campaignAudienceLists).values(row.listIds.map((listId) => ({ campaignId: row.id, listId })));
  }
}

function stepValues(row: StepRecord) {
  const subject = row.subject.trim();
  return {
    id: row.id,
    campaignId: row.campaignId,
    position: row.position,
    subject: row.position > 1 && subject.length === 0 ? null : subject,
    body: row.body,
    delayDays: row.delayDays,
    isHtml: row.contentType === "html",
  };
}

function toStep(row: typeof campaignSteps.$inferSelect): StepRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    position: row.position,
    subject: row.subject ?? "",
    body: row.body,
    delayDays: row.delayDays,
    contentType: row.isHtml ? "html" : "text",
  };
}

function toEnrollment(row: typeof enrollments.$inferSelect): EnrollmentRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    contactId: row.contactId,
    status: asEnrollmentStatus(row.status),
    currentStep: row.currentStep,
    nextSendAt: row.nextSendAt ? row.nextSendAt.toISOString() : null,
    mailboxId: row.mailboxId,
  };
}

function asState(value: string): CampaignState {
  if (value === "draft" || value === "running" || value === "paused" || value === "completed") return value;
  throw new Error(`Unknown campaign status ${value}.`);
}

function asEnrollmentStatus(value: string): EnrollmentRecord["status"] {
  if (value === "active" || value === "completed" || value === "stopped") return value;
  throw new Error(`Unknown enrollment status ${value}.`);
}
