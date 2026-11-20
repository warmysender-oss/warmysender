import { ApiError } from "./errors.js";
import type {
  AppServices,
  Campaign,
  CampaignStats,
  Contact,
  ContactInput,
  ContactList,
  ContactStatus,
  ReplyDraft,
  ReplyThread,
} from "./services.js";

/** In-memory port for tests. There is no send method. */
export function createMemoryServices() {
  const calls: string[] = [];
  const contacts = new Map<string, Contact>();
  const lists = new Map<string, { list: ContactList; contactIds: string[] }>();
  const campaigns = new Map<string, Campaign>();
  const threads = new Map<string, ReplyThread>();
  const drafts: ReplyDraft[] = [];
  let sequence = 1;
  const nextId = (prefix: string) => `${prefix}-${sequence++}`;

  function addContact(input: ContactInput, skipped: { email: string; reason: string }[]): Contact | null {
    const existing = [...contacts.values()].find((contact) => contact.email === input.email);
    if (existing) {
      skipped.push({ email: input.email, reason: "duplicate" });
      return null;
    }
    const contact: Contact = {
      id: nextId("contact"),
      email: input.email,
      first_name: input.first_name ?? null,
      last_name: input.last_name ?? null,
      company: input.company ?? null,
      title: input.title ?? null,
      custom_fields: input.custom_fields ?? {},
      status: "active",
    };
    contacts.set(contact.id, contact);
    return contact;
  }

  const services: AppServices = {
    contacts: {
      async create(input) {
        calls.push("contacts.create");
        const skipped: { email: string; reason: string }[] = [];
        const contact = addContact(input, skipped);
        if (!contact) throw new ApiError(409, "duplicate", skipped[0]?.reason ?? "duplicate");
        return contact;
      },
      async bulkCreate(inputs) {
        calls.push("contacts.bulkCreate");
        const skipped: { email: string; reason: string }[] = [];
        const created = inputs.flatMap((input) => {
          const contact = addContact(input, skipped);
          return contact ? [contact] : [];
        });
        return { created, skipped };
      },
      async list() {
        calls.push("contacts.list");
        return { items: [...contacts.values()], next_cursor: null };
      },
      async updateStatus(id, status: ContactStatus) {
        calls.push("contacts.updateStatus");
        const contact = contacts.get(id);
        if (!contact) return null;
        contact.status = status;
        return contact;
      },
      async findByEmails(emails) {
        const wanted = new Set(emails.map((email) => email.toLowerCase()));
        return [...contacts.values()].filter((contact) => wanted.has(contact.email.toLowerCase()));
      },
    },
    lists: {
      async create(name) {
        calls.push("lists.create");
        const list: ContactList = { id: nextId("list"), name, contact_count: 0 };
        lists.set(list.id, { list, contactIds: [] });
        return list;
      },
      async list() {
        return { items: [...lists.values()].map((item) => item.list), next_cursor: null };
      },
      async addContacts(listId, contactIds) {
        const found = lists.get(listId);
        if (!found) return null;
        for (const contactId of contactIds) {
          if (!found.contactIds.includes(contactId) && contacts.has(contactId)) found.contactIds.push(contactId);
        }
        found.list.contact_count = found.contactIds.length;
        return { added: contactIds.length };
      },
      async emails(listId) {
        const found = lists.get(listId);
        if (!found) return null;
        return found.contactIds.flatMap((id) => {
          const contact = contacts.get(id);
          return contact ? [contact.email] : [];
        });
      },
    },
    campaigns: {
      async create(input) {
        calls.push("campaigns.create");
        const campaign: Campaign = { id: nextId("campaign"), name: input.name, status: "draft", mailbox_ids: [], steps: [] };
        campaigns.set(campaign.id, campaign);
        return campaign;
      },
      async get(id) {
        return campaigns.get(id) ?? null;
      },
      async update(id, input) {
        const campaign = campaigns.get(id);
        if (!campaign) return null;
        if (input.name !== undefined) campaign.name = input.name;
        if (input.mailbox_ids !== undefined) campaign.mailbox_ids = input.mailbox_ids;
        return campaign;
      },
      async addStep(campaignId, input) {
        const campaign = campaigns.get(campaignId);
        if (!campaign) return null;
        const step = { id: nextId("step"), position: campaign.steps.length + 1, ...input };
        campaign.steps.push(step);
        return step;
      },
      async updateStep(campaignId, stepId, input) {
        const campaign = campaigns.get(campaignId);
        const step = campaign?.steps.find((item) => item.id === stepId);
        if (!step) return null;
        if (input.subject !== undefined) step.subject = input.subject;
        if (input.body !== undefined) step.body = input.body;
        if (input.delay_days !== undefined) step.delay_days = input.delay_days;
        return step;
      },
      async deleteStep(campaignId, stepId) {
        const campaign = campaigns.get(campaignId);
        if (!campaign) return false;
        const before = campaign.steps.length;
        campaign.steps = campaign.steps.filter((step) => step.id !== stepId);
        return campaign.steps.length < before;
      },
      async start(id) {
        calls.push("campaigns.start");
        const campaign = campaigns.get(id);
        if (!campaign) return null;
        const problems: string[] = [];
        if (campaign.steps.length === 0) problems.push("A step is empty.");
        if (campaign.mailbox_ids.length === 0) problems.push("No mailboxes.");
        if (problems.length > 0) return { started: false, problems, campaign };
        campaign.status = "running";
        return { started: true, problems: [], campaign };
      },
      async pause(id) {
        calls.push("campaigns.pause");
        const campaign = campaigns.get(id);
        if (!campaign) return null;
        campaign.status = "paused";
        return campaign;
      },
      async stats(id) {
        if (!campaigns.has(id)) return null;
        const stats: CampaignStats = {
          campaign_id: id,
          sent: 0,
          replies: 0,
          reply_rate: null,
          bounces: 0,
          unsubscribes: 0,
          still_in_sequence: 0,
          steps: [],
        };
        return stats;
      },
    },
    enrollments: {
      async enroll(campaignId) {
        calls.push("enrollments.enroll");
        if (!campaigns.has(campaignId)) return null;
        return { enrolled: 1 };
      },
    },
    replies: {
      async list() {
        return { items: [...threads.values()], next_cursor: null };
      },
      async getThread(id) {
        return threads.get(id) ?? null;
      },
      async saveDraft(replyId, body) {
        calls.push("replies.saveDraft");
        if (!threads.has(replyId)) return null;
        const draft: ReplyDraft = { id: nextId("draft"), reply_id: replyId, body, created_at: "2026-11-20T00:00:00.000Z" };
        drafts.push(draft);
        return draft;
      },
    },
    mailboxes: {
      async list() {
        calls.push("mailboxes.list");
        return [{ id: "box-1", email: "ava@harbor-dental.test", provider: "smtp", paused: false, paused_reason: null }];
      },
      async health(id) {
        if (id !== "box-1") return null;
        return {
          id,
          email: "ava@harbor-dental.test",
          provider: "smtp",
          paused: false,
          paused_reason: null,
          sent_today: 2,
          cap_today: 10,
          ramp_day: 3,
          health: "ok",
        };
      },
    },
  };

  return {
    services,
    calls,
    drafts,
    seedThread(thread: ReplyThread) {
      threads.set(thread.id, thread);
    },
  };
}
