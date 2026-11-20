import type { CampaignState, StepContentType } from "../../../../packages/core/src/campaigns/index.js";

export type CampaignRecord = {
  id: string;
  name: string;
  state: CampaignState;
  mailboxIds: string[];
  contactIds: string[];
  listIds: string[];
};

export type StepRecord = {
  id: string;
  campaignId: string;
  position: number;
  subject: string;
  body: string;
  delayDays: number;
  contentType: StepContentType;
};

export type EnrollmentRecord = {
  id: string;
  campaignId: string;
  contactId: string;
  status: "active";
  currentStep: 1;
  nextSendAt: string;
  mailboxId: null;
};

export type MailboxRef = {
  id: string;
  address: string;
  paused: boolean;
};

export type CampaignStore = {
  listCampaigns(): Promise<CampaignRecord[]>;
  getCampaign(id: string): Promise<CampaignRecord | null>;
  insertCampaign(row: CampaignRecord): Promise<void>;
  updateCampaign(row: CampaignRecord): Promise<void>;
  deleteCampaign(id: string): Promise<void>;
  listSteps(campaignId: string): Promise<StepRecord[]>;
  insertStep(row: StepRecord): Promise<void>;
  updateStep(row: StepRecord): Promise<void>;
  deleteStep(id: string): Promise<void>;
  deleteStepsForCampaign(campaignId: string): Promise<void>;
  listEnrollments(campaignId: string): Promise<EnrollmentRecord[]>;
  insertEnrollments(rows: EnrollmentRecord[]): Promise<void>;
  deleteEnrollmentsForCampaign(campaignId: string): Promise<void>;
  listMailboxes(ids: string[]): Promise<MailboxRef[]>;
};
