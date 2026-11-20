import type { AppDatabase } from "@warmysender/core";
import {
  addStep,
  appendCampaignAudience,
  checkLaunch,
  createCampaign,
  deleteStep,
  pauseCampaign,
  setCampaignMailboxes,
  startCampaign,
  updateStep,
  renameCampaign,
  type CampaignDeps,
} from "../campaigns/service.js";
import { createDrizzleCampaignStore } from "../campaigns/db.js";
import type { StepRecord } from "../campaigns/types.js";
import { createDrizzleContactStore } from "../contacts/db.js";
import { normalizeEmail } from "../contacts/email.js";
import {
  addContactsToList,
  createContacts,
  createList,
  setContactStatus,
  UserInputError,
} from "../contacts/service.js";
import type { ContactRecord } from "../contacts/types.js";
import { ApiError } from "./errors.js";
import type {
  AppServices,
  Campaign,
  CampaignStep,
  Contact,
  ContactStatus,
  Page,
  PageQuery,
} from "./services.js";

const PAGE_DEFAULT = 50;

type DomainServices = Pick<AppServices, "contacts" | "lists" | "campaigns" | "enrollments">;

export function createDomainServices(
  db: AppDatabase,
  options?: { now?: () => Date; publicUrl?: string | null },
): DomainServices {
  const contactsStore = createDrizzleContactStore(db);
  const clock = { id: () => crypto.randomUUID() };
  const deps: CampaignDeps = {
    campaigns: createDrizzleCampaignStore(db),
    contacts: contactsStore,
    id: () => crypto.randomUUID(),
    nowIso: () => (options?.now ?? (() => new Date()))().toISOString(),
    publicUrl: options?.publicUrl ?? null,
  };

  return {
    contacts: {
      async create(input) {
        const result = await createContacts(contactsStore, clock, [toWrite(input)]);
        const created = result.created[0];
        if (created) return toApiContact(created);
        const reason = result.skipped[0]?.reason;
        if (reason === "duplicate") throw new ApiError(409, "duplicate", "duplicate");
        if (reason === "suppressed") throw new ApiError(409, "suppressed", "That address is suppressed.");
        throw new ApiError(400, "validation_error", "invalid syntax");
      },
      async bulkCreate(inputs) {
        const result = await createContacts(contactsStore, clock, inputs.map(toWrite));
        return {
          created: result.created.map(toApiContact),
          skipped: result.skipped.map((row) => ({
            email: row.email,
            reason: row.reason === "invalid_syntax" ? "invalid syntax" : row.reason,
          })),
        };
      },
      async list(args) {
        const rows = await contactsStore.listContacts();
        const filtered = args.status ? rows.filter((row) => row.status === args.status) : rows;
        filtered.sort((a, b) => a.email.localeCompare(b.email) || a.id.localeCompare(b.id));
        return page(filtered.map(toApiContact), args);
      },
      async updateStatus(id, status) {
        try {
          const contact = await setContactStatus(contactsStore, clock, id, status);
          return toApiContact(contact);
        } catch (error) {
          if (isNotFound(error, "Contact not found.")) return null;
          rethrow(error);
        }
      },
      async findByEmails(emails) {
        const wanted = new Set(emails.flatMap((email) => {
          const normalized = normalizeEmail(email);
          return normalized ? [normalized] : [];
        }));
        const rows = await contactsStore.listContacts();
        return rows.filter((row) => wanted.has(row.email)).map(toApiContact);
      },
    },
    lists: {
      async create(name) {
        try {
          const list = await createList(contactsStore, clock, name);
          return { id: list.id, name: list.name, contact_count: 0 };
        } catch (error) {
          rethrow(error);
        }
      },
      async list(args) {
        const [lists, memberships] = await Promise.all([
          contactsStore.listLists(),
          contactsStore.listMemberships(),
        ]);
        const items = lists
          .map((list) => ({
            id: list.id,
            name: list.name,
            contact_count: memberships.filter((row) => row.listId === list.id).length,
          }))
          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        return page(items, args);
      },
      async addContacts(listId, contactIds) {
        try {
          return await addContactsToList(contactsStore, listId, contactIds);
        } catch (error) {
          if (isNotFound(error, "List not found.")) return null;
          rethrow(error);
        }
      },
      async emails(listId) {
        const lists = await contactsStore.listLists();
        if (!lists.some((list) => list.id === listId)) return null;
        const [memberships, rows] = await Promise.all([
          contactsStore.listMemberships(),
          contactsStore.listContacts(),
        ]);
        const ids = new Set(memberships.filter((row) => row.listId === listId).map((row) => row.contactId));
        return rows.filter((row) => ids.has(row.id)).map((row) => row.email);
      },
    },
    campaigns: {
      async create(input) {
        try {
          const campaign = await createCampaign(deps, input.name, null);
          return toApiCampaign(campaign, []);
        } catch (error) {
          rethrow(error);
        }
      },
      async get(id) {
        return loadCampaign(deps, id);
      },
      async update(id, input) {
        try {
          if (input.name !== undefined) await renameCampaign(deps, id, input.name);
          if (input.mailbox_ids) await setCampaignMailboxes(deps, id, input.mailbox_ids);
          return await loadCampaign(deps, id);
        } catch (error) {
          if (isNotFound(error, "Campaign not found.")) return null;
          rethrow(error);
        }
      },
      async addStep(campaignId, input) {
        try {
          const step = await addStep(deps, campaignId, {
            subject: input.subject,
            body: input.body,
            delayDays: input.delay_days,
          });
          return toApiStep(step);
        } catch (error) {
          if (isNotFound(error, "Campaign not found.")) return null;
          rethrow(error);
        }
      },
      async updateStep(campaignId, stepId, input) {
        try {
          const step = await updateStep(deps, campaignId, stepId, {
            subject: input.subject,
            body: input.body,
            delayDays: input.delay_days,
          });
          return toApiStep(step);
        } catch (error) {
          if (isNotFound(error, "Campaign not found.") || isNotFound(error, "Step not found.")) return null;
          rethrow(error);
        }
      },
      async deleteStep(campaignId, stepId) {
        try {
          await deleteStep(deps, campaignId, stepId);
          return true;
        } catch (error) {
          if (isNotFound(error, "Campaign not found.") || isNotFound(error, "Step not found.")) return false;
          rethrow(error);
        }
      },
      async start(id) {
        const current = await loadCampaign(deps, id);
        if (!current) return null;
        let issues;
        try {
          issues = await checkLaunch(deps, id);
        } catch (error) {
          if (isNotFound(error, "Campaign not found.")) return null;
          rethrow(error);
        }
        const messages = issues.map((issue) => issue.message);
        if (issues.some((issue) => issue.blocking)) {
          return { started: false, problems: messages, campaign: current };
        }
        try {
          const started = await startCampaign(deps, id);
          const campaign = await loadCampaign(deps, id);
          return { started: true, problems: started.warnings.map((issue) => issue.message), campaign };
        } catch (error) {
          if (isNotFound(error, "Campaign not found.")) return null;
          if (error instanceof UserInputError) {
            return { started: false, problems: [error.message], campaign: current };
          }
          throw error;
        }
      },
      async pause(id) {
        try {
          await pauseCampaign(deps, id);
          return await loadCampaign(deps, id);
        } catch (error) {
          if (isNotFound(error, "Campaign not found.")) return null;
          rethrow(error);
        }
      },
      async stats() {
        return null;
      },
    },
    enrollments: {
      async enroll(campaignId, input) {
        try {
          return await appendCampaignAudience(deps, campaignId, {
            contactIds: input.contact_ids,
            listIds: input.list_id ? [input.list_id] : [],
          });
        } catch (error) {
          if (isNotFound(error, "Campaign not found.")) return null;
          if (isNotFound(error, "List not found.")) throw new ApiError(404, "not_found", "List not found.");
          rethrow(error);
        }
      },
    },
  };
}

function toWrite(input: {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  custom_fields?: Record<string, string>;
}) {
  return {
    email: input.email,
    firstName: input.first_name,
    lastName: input.last_name,
    company: input.company,
    title: input.title,
    customFields: input.custom_fields,
  };
}

function toApiContact(row: ContactRecord): Contact {
  return {
    id: row.id,
    email: row.email,
    first_name: row.firstName,
    last_name: row.lastName,
    company: row.company,
    title: row.title,
    custom_fields: row.customFields,
    status: row.status as ContactStatus,
  };
}

function toApiStep(step: StepRecord): CampaignStep {
  return {
    id: step.id,
    position: step.position,
    subject: step.subject,
    body: step.body,
    delay_days: step.delayDays,
  };
}

function toApiCampaign(
  campaign: { id: string; name: string; state: Campaign["status"]; mailboxIds: string[] },
  steps: StepRecord[],
): Campaign {
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.state,
    mailbox_ids: campaign.mailboxIds,
    steps: [...steps].sort((a, b) => a.position - b.position).map(toApiStep),
  };
}

async function loadCampaign(deps: CampaignDeps, id: string): Promise<Campaign | null> {
  const campaign = await deps.campaigns.getCampaign(id);
  if (!campaign) return null;
  const steps = await deps.campaigns.listSteps(id);
  return toApiCampaign(campaign, steps);
}

function page<T>(items: T[], args: PageQuery): Page<T> {
  const limit = args.limit ?? PAGE_DEFAULT;
  const offset = offsetOf(args.cursor);
  const slice = items.slice(offset, offset + limit);
  return { items: slice, next_cursor: slice.length === limit ? String(offset + limit) : null };
}

function offsetOf(cursor: string | undefined): number {
  if (!cursor) return 0;
  const value = Number(cursor);
  if (!Number.isInteger(value) || value < 0) throw new ApiError(400, "validation_error", "cursor is not valid.");
  return value;
}

function isNotFound(error: unknown, message: string): boolean {
  return error instanceof UserInputError && error.message === message;
}

function rethrow(error: unknown): never {
  if (error instanceof ApiError) throw error;
  if (error instanceof UserInputError) throw new ApiError(400, "validation_error", error.message);
  throw error;
}
