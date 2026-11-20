import { ApiError } from "./errors.js";
import { rejectLimitFields } from "./limits.js";
import { openApiDocument } from "./openapi.js";
import { API_ROUTES, type ApiRoute } from "./routes.js";
import {
  CONTACT_STATUSES,
  type AppServices,
  type ContactInput,
  type ContactStatus,
  type Page,
} from "./services.js";

export type ApiResult = { status: number; body: unknown };

export async function handleApiV1(
  services: AppServices,
  request: { method: string; path: string; query: URLSearchParams; body: unknown },
): Promise<ApiResult> {
  const method = request.method.toUpperCase();
  const path = request.path.startsWith("/") ? request.path : `/${request.path}`;
  let matched: { route: ApiRoute; params: Record<string, string> } | null = null;
  for (const route of API_ROUTES) {
    if (route.method !== method) continue;
    const params = matchPath(route.path, path);
    if (params) {
      matched = { route, params };
      break;
    }
  }
  if (!matched) throw new ApiError(404, "not_found", "No such API route.");

  if (matched.route.operationId !== "getOpenApi") rejectLimitFields(request.body);

  switch (matched.route.operationId) {
    case "getOpenApi":
      return { status: 200, body: openApiDocument() };
    case "createContact":
      return { status: 201, body: { data: await services.contacts.create(parseContact(objectBody(request.body))) } };
    case "bulkCreateContacts":
      return { status: 200, body: { data: await bulkCreate(services, request.body) } };
    case "listContacts":
      return { status: 200, body: pageBody(await services.contacts.list(listQuery(request.query))) };
    case "updateContactStatus": {
      const status = requireStatus(objectBody(request.body));
      const contact = await services.contacts.updateStatus(matched.params.id, status);
      if (!contact) throw new ApiError(404, "not_found", "Contact not found.");
      return { status: 200, body: { data: contact } };
    }
    case "createList": {
      const name = requireString(objectBody(request.body), "name");
      return { status: 201, body: { data: await services.lists.create(name) } };
    }
    case "listLists":
      return { status: 200, body: pageBody(await services.lists.list(pageQuery(request.query))) };
    case "addContactsToList": {
      const ids = requireStringArray(objectBody(request.body), "contact_ids");
      const added = await services.lists.addContacts(matched.params.id, ids);
      if (!added) throw new ApiError(404, "not_found", "List not found.");
      return { status: 200, body: { data: added } };
    }
    case "createCampaign": {
      const name = requireString(objectBody(request.body), "name");
      return { status: 201, body: { data: await services.campaigns.create({ name }) } };
    }
    case "getCampaign":
      return { status: 200, body: { data: await requireCampaign(services, matched.params.id) } };
    case "updateCampaign": {
      const body = objectBody(request.body);
      const name = optionalString(body, "name");
      const mailboxIds = "mailbox_ids" in body ? requireStringArray(body, "mailbox_ids") : undefined;
      if (name === undefined && mailboxIds === undefined) {
        throw new ApiError(400, "validation_error", "Provide name or mailbox_ids.");
      }
      const campaign = await services.campaigns.update(matched.params.id, {
        name: name ?? undefined,
        mailbox_ids: mailboxIds,
      });
      if (!campaign) throw new ApiError(404, "not_found", "Campaign not found.");
      return { status: 200, body: { data: campaign } };
    }
    case "addCampaignStep": {
      const body = objectBody(request.body);
      const step = await services.campaigns.addStep(matched.params.id, {
        subject: requireString(body, "subject"),
        body: requireBodyString(body),
        delay_days: requireDelay(body),
      });
      if (!step) throw new ApiError(404, "not_found", "Campaign not found.");
      return { status: 201, body: { data: step } };
    }
    case "updateCampaignStep": {
      const body = objectBody(request.body);
      const subject = optionalString(body, "subject");
      const text = optionalString(body, "body");
      const delay = "delay_days" in body ? requireDelay(body) : undefined;
      if (subject === undefined && text === undefined && delay === undefined) {
        throw new ApiError(400, "validation_error", "Provide subject, body, or delay_days.");
      }
      const step = await services.campaigns.updateStep(matched.params.id, matched.params.stepId, {
        subject: subject ?? undefined,
        body: text ?? undefined,
        delay_days: delay,
      });
      if (!step) throw new ApiError(404, "not_found", "Step not found.");
      return { status: 200, body: { data: step } };
    }
    case "deleteCampaignStep": {
      const removed = await services.campaigns.deleteStep(matched.params.id, matched.params.stepId);
      if (!removed) throw new ApiError(404, "not_found", "Step not found.");
      return { status: 200, body: { data: { deleted: true } } };
    }
    case "startCampaign": {
      requireEmpty(request.body);
      const result = await services.campaigns.start(matched.params.id);
      if (!result) throw new ApiError(404, "not_found", "Campaign not found.");
      return { status: result.started ? 200 : 409, body: { data: result } };
    }
    case "pauseCampaign": {
      requireEmpty(request.body);
      const campaign = await services.campaigns.pause(matched.params.id);
      if (!campaign) throw new ApiError(404, "not_found", "Campaign not found.");
      return { status: 200, body: { data: campaign } };
    }
    case "getCampaignStats": {
      const stats = await services.campaigns.stats(matched.params.id);
      if (!stats) throw new ApiError(404, "not_found", "Campaign not found.");
      return { status: 200, body: { data: stats } };
    }
    case "enroll": {
      const body = objectBody(request.body);
      const contactIds = "contact_ids" in body ? requireStringArray(body, "contact_ids") : undefined;
      const listId = optionalString(body, "list_id");
      if ((!contactIds || contactIds.length === 0) && !listId) {
        throw new ApiError(400, "validation_error", "Provide contact_ids or list_id.");
      }
      const enrolled = await services.enrollments.enroll(matched.params.id, {
        contact_ids: contactIds,
        list_id: listId ?? undefined,
      });
      if (!enrolled) throw new ApiError(404, "not_found", "Campaign not found.");
      return { status: 200, body: { data: enrolled } };
    }
    case "listReplies":
      return { status: 200, body: pageBody(await services.replies.list(pageQuery(request.query))) };
    case "getReplyThread": {
      const thread = await services.replies.getThread(matched.params.id);
      if (!thread) throw new ApiError(404, "not_found", "Reply not found.");
      return { status: 200, body: { data: thread } };
    }
    case "draftReply": {
      const text = requireBodyString(objectBody(request.body));
      const draft = await services.replies.saveDraft(matched.params.id, text);
      if (!draft) throw new ApiError(404, "not_found", "Reply not found.");
      return { status: 201, body: { data: draft } };
    }
    case "listMailboxes":
      return { status: 200, body: { data: await services.mailboxes.list() } };
    case "getMailboxHealth": {
      const health = await services.mailboxes.health(matched.params.id);
      if (!health) throw new ApiError(404, "not_found", "Mailbox not found.");
      return { status: 200, body: { data: health } };
    }
    default:
      throw new ApiError(404, "not_found", "No such API route.");
  }
}

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const expected = pattern.split("/").filter(Boolean);
  const actual = path.split("/").filter(Boolean);
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < expected.length; index += 1) {
    const token = expected[index];
    if (token.startsWith("{") && token.endsWith("}")) {
      params[token.slice(1, -1)] = decodeURIComponent(actual[index]);
    } else if (token !== actual[index]) {
      return null;
    }
  }
  return params;
}

async function bulkCreate(services: AppServices, body: unknown) {
  const object = objectBody(body);
  if (!Array.isArray(object.contacts)) throw new ApiError(400, "validation_error", "contacts must be an array.");
  if (object.contacts.length > 1000) throw new ApiError(400, "validation_error", "At most 1000 contacts per request.");
  const skipped: { email: string; reason: string }[] = [];
  const inputs: ContactInput[] = [];
  for (const item of object.contacts) {
    try {
      inputs.push(parseContact(item));
    } catch (error) {
      const email = item !== null && typeof item === "object" && "email" in item ? String((item as { email: unknown }).email) : "";
      skipped.push({ email, reason: error instanceof ApiError ? error.message : "invalid syntax" });
    }
  }
  const created = await services.contacts.bulkCreate(inputs);
  return { created: created.created, skipped: [...skipped, ...created.skipped] };
}

async function requireCampaign(services: AppServices, id: string) {
  const campaign = await services.campaigns.get(id);
  if (!campaign) throw new ApiError(404, "not_found", "Campaign not found.");
  return campaign;
}

function pageBody<T>(page: Page<T>) {
  return {
    data: page.items,
    pagination: { has_more: page.next_cursor !== null, next_cursor: page.next_cursor },
  };
}

function listQuery(query: URLSearchParams) {
  const page = pageQuery(query);
  const status = query.get("status");
  if (status === null || status === "") return page;
  if (!CONTACT_STATUSES.includes(status as ContactStatus)) {
    throw new ApiError(400, "validation_error", "status is not a contact status.");
  }
  return { ...page, status: status as ContactStatus };
}

function pageQuery(query: URLSearchParams): { cursor?: string; limit?: number } {
  const cursor = query.get("cursor") ?? undefined;
  const limitRaw = query.get("limit");
  if (limitRaw === null || limitRaw === "") return { cursor };
  const limit = Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ApiError(400, "validation_error", "limit must be an integer from 1 to 100.");
  }
  return { cursor, limit };
}

function objectBody(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) throw new ApiError(400, "validation_error", "Body must be a JSON object.");
  if (typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "validation_error", "Body must be a JSON object.");
  return body as Record<string, unknown>;
}

function requireEmpty(body: unknown): void {
  if (body === undefined || body === null) return;
  const object = objectBody(body);
  if (Object.keys(object).length > 0) {
    throw new ApiError(400, "validation_error", "This call takes no fields.");
  }
}

function parseContact(value: unknown): ContactInput {
  const object = objectBody(value);
  const custom = object.custom_fields;
  let customFields: Record<string, string> | undefined;
  if (custom !== undefined) {
    if (custom === null || typeof custom !== "object" || Array.isArray(custom)) {
      throw new ApiError(400, "validation_error", "custom_fields must be an object of strings.");
    }
    customFields = {};
    for (const [key, field] of Object.entries(custom)) {
      if (typeof field !== "string") throw new ApiError(400, "validation_error", "custom_fields must be an object of strings.");
      customFields[key] = field;
    }
  }
  return {
    email: requireEmail(object.email),
    first_name: optionalString(object, "first_name"),
    last_name: optionalString(object, "last_name"),
    company: optionalString(object, "company"),
    title: optionalString(object, "title"),
    custom_fields: customFields,
  };
}

function requireEmail(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "validation_error", "email is required.");
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "validation_error", "invalid syntax");
  return email;
}

function requireStatus(object: Record<string, unknown>): ContactStatus {
  const status = object.status;
  if (typeof status !== "string" || !CONTACT_STATUSES.includes(status as ContactStatus)) {
    throw new ApiError(400, "validation_error", "status is not a contact status.");
  }
  return status as ContactStatus;
}

function requireString(object: Record<string, unknown>, key: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "validation_error", `${key} is required.`);
  }
  return value.trim();
}

function requireBodyString(object: Record<string, unknown>): string {
  const value = object.body;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "validation_error", "body is required.");
  }
  return value;
}

function optionalString(object: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in object)) return undefined;
  const value = object[key];
  if (value === null) return null;
  if (typeof value !== "string") throw new ApiError(400, "validation_error", `${key} must be a string.`);
  return value;
}

function requireStringArray(object: Record<string, unknown>, key: string): string[] {
  const value = object[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new ApiError(400, "validation_error", `${key} must be an array of strings.`);
  }
  return value;
}

function requireDelay(object: Record<string, unknown>): number {
  const value = object.delay_days;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ApiError(400, "validation_error", "delay_days must be an integer of 0 or more.");
  }
  return value;
}
