export { createMemoryCampaignStore } from "./memory-store.js";
export {
  addStep,
  checkLaunch,
  createCampaign,
  deleteCampaign,
  deleteStep,
  listCampaignDetails,
  pauseCampaign,
  previewCampaignStep,
  renameCampaign,
  setCampaignAudience,
  setCampaignMailboxes,
  startCampaign,
  updateStep,
} from "./service.js";
export type { CampaignDeps, CampaignDetail, StartResult } from "./service.js";
export type {
  CampaignRecord,
  CampaignStore,
  EnrollmentRecord,
  MailboxRef,
  StepRecord,
} from "./types.js";
