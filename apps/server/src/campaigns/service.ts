import {
  assertDeletable,
  assertStructureEditable,
  cleanCampaignName,
  cleanContentType,
  cleanDelay,
  cleanStepBody,
  enrollableContacts,
  launchCheck,
  planPause,
  planStart,
  previewStep,
  renumberSteps,
  uniqueIds,
  type LaunchContact,
  type LaunchIssue,
  type StepPreview,
} from "@warmysender/core";
import { contactIdsInLists } from "../contacts/lists.js";
import { isSuppressed } from "../contacts/suppression.js";
import type { ContactRecord, ContactStore } from "../contacts/types.js";
import { UserInputError } from "../contacts/service.js";
import type { CampaignRecord, CampaignStore, StepRecord } from "./types.js";

export type CampaignDeps = {
  campaigns: CampaignStore;
  contacts: ContactStore;
  id: () => string;
  nowIso: () => string;
  publicUrl: string | null;
};

export type CampaignDetail = CampaignRecord & { steps: StepRecord[] };

export type StartResult = {
  state: "running";
  enrollmentsCreated: number;
  warnings: LaunchIssue[];
};

export async function listCampaignDetails(deps: CampaignDeps): Promise<CampaignDetail[]> {
  const campaigns = await deps.campaigns.listCampaigns();
  const details: CampaignDetail[] = [];
  for (const campaign of campaigns) {
    details.push({ ...campaign, steps: await orderedSteps(deps, campaign.id) });
  }
  return details;
}

export async function createCampaign(
  deps: CampaignDeps,
  name: string,
  createdBy: string | null = null,
): Promise<CampaignDetail> {
  const cleaned = cleanCampaignName(name);
  if (!cleaned.ok) throw new UserInputError(cleaned.error);
  const campaign: CampaignRecord = {
    id: deps.id(),
    name: cleaned.name,
    state: "draft",
    createdBy,
    mailboxIds: [],
    contactIds: [],
    listIds: [],
  };
  await deps.campaigns.insertCampaign(campaign);
  return { ...campaign, steps: [] };
}

export async function renameCampaign(
  deps: CampaignDeps,
  campaignId: string,
  name: string,
): Promise<CampaignDetail> {
  const campaign = await requireCampaign(deps, campaignId);
  const cleaned = cleanCampaignName(name);
  if (!cleaned.ok) throw new UserInputError(cleaned.error);
  const next = { ...campaign, name: cleaned.name };
  await deps.campaigns.updateCampaign(next);
  return { ...next, steps: await orderedSteps(deps, campaignId) };
}

export async function deleteCampaign(deps: CampaignDeps, campaignId: string): Promise<void> {
  const campaign = await requireCampaign(deps, campaignId);
  const allowed = assertDeletable(campaign.state);
  if (!allowed.ok) throw new UserInputError(allowed.error);
  await deps.campaigns.deleteEnrollmentsForCampaign(campaignId);
  await deps.campaigns.deleteStepsForCampaign(campaignId);
  await deps.campaigns.deleteCampaign(campaignId);
}

export async function addStep(
  deps: CampaignDeps,
  campaignId: string,
  input: { subject?: string; body?: string; delayDays?: number; contentType?: string },
): Promise<StepRecord> {
  await requireEditable(deps, campaignId);
  const steps = await orderedSteps(deps, campaignId);
  const contentType = cleanContentType(input.contentType ?? "text");
  if (!contentType.ok) throw new UserInputError(contentType.error);
  const position = steps.length + 1;
  const delay = cleanDelay(position === 1 ? 0 : (input.delayDays ?? 0));
  if (!delay.ok) throw new UserInputError(delay.error);
  if (position === 1 && input.delayDays !== undefined && input.delayDays !== 0) {
    throw new UserInputError("The first step must send with no delay.");
  }
  const rawBody = input.body === undefined ? "Hi {{first_name|there}},\n\n{{unsubscribe_link}}" : input.body;
  const step: StepRecord = {
    id: deps.id(),
    campaignId,
    position,
    subject: input.subject ?? "",
    body: cleanStepBody(rawBody, contentType.contentType),
    delayDays: position === 1 ? 0 : delay.delayDays,
    contentType: contentType.contentType,
  };
  await deps.campaigns.insertStep(step);
  return step;
}

export async function updateStep(
  deps: CampaignDeps,
  campaignId: string,
  stepId: string,
  input: { subject?: string; body?: string; delayDays?: number; contentType?: string },
): Promise<StepRecord> {
  await requireEditable(deps, campaignId);
  const steps = await orderedSteps(deps, campaignId);
  const current = steps.find((step) => step.id === stepId);
  if (!current) throw new UserInputError("Step not found.");
  const contentType = cleanContentType(input.contentType ?? current.contentType);
  if (!contentType.ok) throw new UserInputError(contentType.error);
  const delayDays = input.delayDays === undefined ? current.delayDays : input.delayDays;
  const delay = cleanDelay(current.position === 1 ? 0 : delayDays);
  if (!delay.ok) throw new UserInputError(delay.error);
  if (current.position === 1 && input.delayDays !== undefined && input.delayDays !== 0) {
    throw new UserInputError("The first step must send with no delay.");
  }
  const next: StepRecord = {
    ...current,
    subject: input.subject === undefined ? current.subject : input.subject,
    body: cleanStepBody(input.body === undefined ? current.body : input.body, contentType.contentType),
    delayDays: current.position === 1 ? 0 : delay.delayDays,
    contentType: contentType.contentType,
  };
  await deps.campaigns.updateStep(next);
  return next;
}

export async function deleteStep(
  deps: CampaignDeps,
  campaignId: string,
  stepId: string,
): Promise<StepRecord[]> {
  await requireEditable(deps, campaignId);
  const steps = await orderedSteps(deps, campaignId);
  if (!steps.some((step) => step.id === stepId)) throw new UserInputError("Step not found.");
  await deps.campaigns.deleteStep(stepId);
  const renumbered = renumberSteps(steps.filter((step) => step.id !== stepId)).map((step) => ({
    ...step,
    campaignId,
  }));
  for (const step of renumbered) await deps.campaigns.updateStep(step);
  return renumbered;
}

export async function setCampaignMailboxes(
  deps: CampaignDeps,
  campaignId: string,
  mailboxIds: string[],
): Promise<CampaignDetail> {
  const campaign = await requireEditable(deps, campaignId);
  const ids = uniqueIds(mailboxIds);
  const found = await deps.campaigns.listMailboxes(ids);
  const foundIds = new Set(found.map((mailbox) => mailbox.id));
  const missing = ids.find((id) => !foundIds.has(id));
  if (missing) throw new UserInputError("Mailbox not found.");
  const next = { ...campaign, mailboxIds: ids };
  await deps.campaigns.updateCampaign(next);
  return { ...next, steps: await orderedSteps(deps, campaignId) };
}

export async function setCampaignAudience(
  deps: CampaignDeps,
  campaignId: string,
  input: { contactIds: string[]; listIds: string[] },
): Promise<CampaignDetail> {
  const campaign = await requireEditable(deps, campaignId);
  const contactIds = uniqueIds(input.contactIds);
  const listIds = uniqueIds(input.listIds);
  const [contacts, lists] = await Promise.all([deps.contacts.listContacts(), deps.contacts.listLists()]);
  const knownContacts = new Set(contacts.map((contact) => contact.id));
  const knownLists = new Set(lists.map((list) => list.id));
  if (contactIds.some((id) => !knownContacts.has(id))) throw new UserInputError("Contact not found.");
  if (listIds.some((id) => !knownLists.has(id))) throw new UserInputError("List not found.");
  const next = { ...campaign, contactIds, listIds };
  await deps.campaigns.updateCampaign(next);
  return { ...next, steps: await orderedSteps(deps, campaignId) };
}

/**
 * Adds contacts and lists to the draft audience. Enrollment rows are created later by `startCampaign`.
 * The count is how many of the newly covered contacts are active and not suppressed.
 */
export async function appendCampaignAudience(
  deps: CampaignDeps,
  campaignId: string,
  input: { contactIds?: string[]; listIds?: string[] },
): Promise<{ enrolled: number }> {
  const campaign = await requireCampaign(deps, campaignId);
  const listIds = uniqueIds(input.listIds ?? []);
  const [contacts, lists, memberships, suppressions, enrollments] = await Promise.all([
    deps.contacts.listContacts(),
    deps.contacts.listLists(),
    deps.contacts.listMemberships(),
    deps.contacts.listSuppressions(),
    deps.campaigns.listEnrollments(campaignId),
  ]);
  const knownLists = new Set(lists.map((list) => list.id));
  for (const listId of listIds) {
    if (!knownLists.has(listId)) throw new UserInputError("List not found.");
  }
  const knownContacts = new Set(contacts.map((contact) => contact.id));
  const contactIds = uniqueIds(input.contactIds ?? []).filter((id) => knownContacts.has(id));
  const newContactIds = contactIds.filter((id) => !campaign.contactIds.includes(id));
  const newListIds = listIds.filter((id) => !campaign.listIds.includes(id));
  const alreadyCovered = new Set<string>([
    ...campaign.contactIds,
    ...contactIdsInLists(memberships, campaign.listIds),
    ...enrollments.map((row) => row.contactId),
  ]);
  const candidateIds = new Set<string>([...newContactIds, ...contactIdsInLists(memberships, newListIds)]);
  const fresh = contacts
    .filter((contact) => candidateIds.has(contact.id) && !alreadyCovered.has(contact.id))
    .map((contact) => toLaunchContact(contact, suppressions));
  const enrolled = enrollableContacts(fresh, []).length;
  if (newContactIds.length > 0 || newListIds.length > 0) {
    await setCampaignAudience(deps, campaignId, {
      contactIds: uniqueIds([...campaign.contactIds, ...contactIds]),
      listIds: uniqueIds([...campaign.listIds, ...listIds]),
    });
  }
  return { enrolled };
}

export async function checkLaunch(deps: CampaignDeps, campaignId: string): Promise<LaunchIssue[]> {
  const campaign = await requireCampaign(deps, campaignId);
  const loaded = await loadLaunchInputs(deps, campaign);
  return launchCheck(loaded);
}

export async function previewCampaignStep(
  deps: CampaignDeps,
  campaignId: string,
  stepId: string,
  contactId: string,
): Promise<StepPreview> {
  await requireCampaign(deps, campaignId);
  const steps = await orderedSteps(deps, campaignId);
  const step = steps.find((row) => row.id === stepId);
  if (!step) throw new UserInputError("Step not found.");
  const contacts = await deps.contacts.listContacts();
  const contact = contacts.find((row) => row.id === contactId);
  if (!contact) throw new UserInputError("Contact not found.");
  return previewStep(step, {
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.company,
    title: contact.title,
    customFields: contact.customFields,
    unsubscribeLink: previewUnsubscribeLink(deps.publicUrl),
  });
}

export async function startCampaign(deps: CampaignDeps, campaignId: string): Promise<StartResult> {
  const campaign = await requireCampaign(deps, campaignId);
  const loaded = await loadLaunchInputs(deps, campaign);
  const issues = launchCheck(loaded);
  const plan = planStart({
    state: campaign.state,
    contacts: loaded.contacts,
    existingEnrollments: await deps.campaigns.listEnrollments(campaignId),
    issues,
    nowIso: deps.nowIso(),
  });
  if (!plan.ok) throw new UserInputError(plan.error);
  if (plan.enrollments.length > 0) {
    await deps.campaigns.insertEnrollments(
      plan.enrollments.map((enrollment) => ({
        id: deps.id(),
        campaignId,
        ...enrollment,
      })),
    );
  }
  await deps.campaigns.updateCampaign({ ...campaign, state: "running" });
  return {
    state: "running",
    enrollmentsCreated: plan.enrollments.length,
    warnings: plan.warnings,
  };
}

export async function pauseCampaign(deps: CampaignDeps, campaignId: string): Promise<{ state: "paused" }> {
  const campaign = await requireCampaign(deps, campaignId);
  const plan = planPause(campaign.state);
  if (!plan.ok) throw new UserInputError(plan.error);
  await deps.campaigns.updateCampaign({ ...campaign, state: "paused" });
  return { state: "paused" };
}

async function loadLaunchInputs(deps: CampaignDeps, campaign: CampaignRecord) {
  const [steps, mailboxRows, audience] = await Promise.all([
    orderedSteps(deps, campaign.id),
    deps.campaigns.listMailboxes(campaign.mailboxIds),
    resolveAudience(deps, campaign),
  ]);
  const byId = new Map(mailboxRows.map((mailbox) => [mailbox.id, mailbox]));
  const mailboxes = campaign.mailboxIds.flatMap((id) => {
    const mailbox = byId.get(id);
    return mailbox ? [mailbox] : [];
  });
  const missingMailboxIds = campaign.mailboxIds.filter((id) => !byId.has(id));
  return {
    steps,
    mailboxes,
    missingMailboxIds,
    contacts: audience,
  };
}

async function resolveAudience(deps: CampaignDeps, campaign: CampaignRecord): Promise<LaunchContact[]> {
  const [contacts, memberships, suppressions, enrollments] = await Promise.all([
    deps.contacts.listContacts(),
    deps.contacts.listMemberships(),
    deps.contacts.listSuppressions(),
    deps.campaigns.listEnrollments(campaign.id),
  ]);
  const fromLists = contactIdsInLists(memberships, campaign.listIds);
  const wanted = new Set<string>([...campaign.contactIds, ...fromLists, ...enrollments.map((row) => row.contactId)]);
  return contacts.filter((contact) => wanted.has(contact.id)).map((contact) => toLaunchContact(contact, suppressions));
}

function toLaunchContact(
  contact: ContactRecord,
  suppressions: Array<{ kind: "email" | "domain"; value: string }>,
): LaunchContact {
  return {
    id: contact.id,
    email: contact.email,
    status: contact.status,
    suppressed: isSuppressed(contact.email, suppressions),
  };
}

function previewUnsubscribeLink(publicUrl: string | null): string {
  const base = publicUrl?.trim().replace(/\/+$/, "") ?? "";
  if (!base) return "";
  return `${base}/u/preview`;
}

async function orderedSteps(deps: CampaignDeps, campaignId: string): Promise<StepRecord[]> {
  const steps = await deps.campaigns.listSteps(campaignId);
  return [...steps].sort((a, b) => a.position - b.position);
}

async function requireCampaign(deps: CampaignDeps, campaignId: string): Promise<CampaignRecord> {
  const campaign = await deps.campaigns.getCampaign(campaignId);
  if (!campaign) throw new UserInputError("Campaign not found.");
  return campaign;
}

async function requireEditable(deps: CampaignDeps, campaignId: string): Promise<CampaignRecord> {
  const campaign = await requireCampaign(deps, campaignId);
  const allowed = assertStructureEditable(campaign.state);
  if (!allowed.ok) throw new UserInputError(allowed.error);
  return campaign;
}
