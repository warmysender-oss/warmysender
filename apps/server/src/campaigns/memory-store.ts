import type {
  CampaignRecord,
  CampaignStore,
  EnrollmentRecord,
  MailboxRef,
  StepRecord,
} from "./types.js";

export function createMemoryCampaignStore(mailboxes: MailboxRef[] = []): CampaignStore {
  const campaigns: CampaignRecord[] = [];
  const steps: StepRecord[] = [];
  const enrollments: EnrollmentRecord[] = [];
  const knownMailboxes = mailboxes.map((row) => ({ ...row }));

  return {
    async listCampaigns() {
      return campaigns.map(cloneCampaign);
    },
    async getCampaign(id) {
      const found = campaigns.find((row) => row.id === id);
      return found ? cloneCampaign(found) : null;
    },
    async insertCampaign(row) {
      campaigns.push(cloneCampaign(row));
    },
    async updateCampaign(row) {
      const index = campaigns.findIndex((campaign) => campaign.id === row.id);
      if (index >= 0) campaigns[index] = cloneCampaign(row);
    },
    async deleteCampaign(id) {
      const index = campaigns.findIndex((campaign) => campaign.id === id);
      if (index >= 0) campaigns.splice(index, 1);
    },
    async listSteps(campaignId) {
      return steps.filter((step) => step.campaignId === campaignId).map((step) => ({ ...step }));
    },
    async insertStep(row) {
      steps.push({ ...row });
    },
    async updateStep(row) {
      const index = steps.findIndex((step) => step.id === row.id);
      if (index >= 0) steps[index] = { ...row };
    },
    async deleteStep(id) {
      const index = steps.findIndex((step) => step.id === id);
      if (index >= 0) steps.splice(index, 1);
    },
    async deleteStepsForCampaign(campaignId) {
      for (let index = steps.length - 1; index >= 0; index -= 1) {
        if (steps[index]?.campaignId === campaignId) steps.splice(index, 1);
      }
    },
    async listEnrollments(campaignId) {
      return enrollments
        .filter((row) => row.campaignId === campaignId)
        .map((row) => ({ ...row }));
    },
    async insertEnrollments(rows) {
      enrollments.push(...rows.map((row) => ({ ...row })));
    },
    async deleteEnrollmentsForCampaign(campaignId) {
      for (let index = enrollments.length - 1; index >= 0; index -= 1) {
        if (enrollments[index]?.campaignId === campaignId) enrollments.splice(index, 1);
      }
    },
    async listMailboxes(ids) {
      const wanted = new Set(ids);
      return knownMailboxes.filter((row) => wanted.has(row.id)).map((row) => ({ ...row }));
    },
  };
}

function cloneCampaign(row: CampaignRecord): CampaignRecord {
  return {
    ...row,
    mailboxIds: [...row.mailboxIds],
    contactIds: [...row.contactIds],
    listIds: [...row.listIds],
    createdBy: row.createdBy,
  };
}
