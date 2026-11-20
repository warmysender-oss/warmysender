export type CampaignState = "draft" | "running" | "paused" | "completed";
export type StepContentType = "text" | "html";

export type CampaignSummary = {
  id: string;
  name: string;
  state: CampaignState;
};

export type CampaignStepView = {
  id: string;
  position: number;
  subject: string;
  body: string;
  delayDays: number;
  contentType: StepContentType;
};

export type CampaignDetail = CampaignSummary & {
  steps: CampaignStepView[];
  mailboxIds: string[];
  contactIds: string[];
  listIds: string[];
};

export type MailboxOption = {
  id: string;
  address: string;
  paused: boolean;
};

export type ContactOption = {
  id: string;
  email: string;
  firstName: string | null;
  company: string | null;
  status: string;
};

export type ListOption = {
  id: string;
  name: string;
};

export type LaunchIssueView = {
  code: string;
  message: string;
  blocking: boolean;
};

export type StepPreviewView = {
  subject: string;
  body: string;
  contentType: StepContentType;
  warnings: string[];
};
