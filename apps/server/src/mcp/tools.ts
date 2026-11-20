import { errorBody, ApiError } from "../api/errors.js";
import { rejectLimitFields, SAFETY_SENTENCE } from "../api/limits.js";
import type { AppServices } from "../api/services.js";
import { handleApiV1, type ApiResult } from "../api/v1.js";

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call(services: AppServices, args: unknown): Promise<ApiResult>;
};

const string = { type: "string" };
const nullableString = { type: ["string", "null"] };

function objectSchema(properties: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

function describe(what: string, when: string): string {
  return `What: ${what} When: ${when} ${SAFETY_SENTENCE}`;
}

async function route(
  services: AppServices,
  method: string,
  path: string,
  body: unknown,
  query?: Record<string, string | undefined>,
): Promise<ApiResult> {
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params.set(key, value);
    }
  }
  return handleApiV1(services, { method, path, query: params, body });
}

function arg(args: unknown): Record<string, unknown> {
  if (args === undefined || args === null) return {};
  if (typeof args !== "object" || Array.isArray(args)) {
    throw new ApiError(400, "validation_error", "Tool arguments must be an object.");
  }
  return args as Record<string, unknown>;
}

function id(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, "validation_error", `${key} is required.`);
  }
  return value;
}

function queryArgs(args: Record<string, unknown>): Record<string, string | undefined> {
  return {
    cursor: typeof args.cursor === "string" ? args.cursor : undefined,
    limit: typeof args.limit === "number" ? String(args.limit) : undefined,
    status: typeof args.status === "string" ? args.status : undefined,
  };
}

const pageProps = { cursor: string, limit: { type: "integer", minimum: 1, maximum: 100 } };

export const MCP_TOOLS: readonly McpTool[] = [
  {
    name: "create_contact",
    description: describe("Creates one contact. Email is required.", "You have a new person to store before a campaign."),
    inputSchema: objectSchema(
      {
        email: string,
        first_name: nullableString,
        last_name: nullableString,
        company: nullableString,
        title: nullableString,
        custom_fields: { type: "object", additionalProperties: { type: "string" } },
      },
      ["email"],
    ),
    call: (services, args) => route(services, "POST", "/contacts", arg(args)),
  },
  {
    name: "bulk_create_contacts",
    description: describe(
      "Creates many contacts. Invalid, duplicate, and suppressed addresses are skipped.",
      "You are importing a set of people and need the skip counts.",
    ),
    inputSchema: objectSchema(
      {
        contacts: {
          type: "array",
          items: objectSchema(
            {
              email: string,
              first_name: nullableString,
              last_name: nullableString,
              company: nullableString,
              title: nullableString,
              custom_fields: { type: "object", additionalProperties: { type: "string" } },
            },
            ["email"],
          ),
        },
      },
      ["contacts"],
    ),
    call: (services, args) => route(services, "POST", "/contacts/bulk", arg(args)),
  },
  {
    name: "list_contacts",
    description: describe("Lists contacts, optionally filtered by status.", "You need to see who is already stored."),
    inputSchema: objectSchema({ ...pageProps, status: string }, []),
    call: (services, args) => route(services, "GET", "/contacts", undefined, queryArgs(arg(args))),
  },
  {
    name: "update_contact_status",
    description: describe(
      "Sets a contact's status. Statuses: active, replied, bounced, unsubscribed, invalid, risky.",
      "A person should be marked replied, unsubscribed, invalid, or risky.",
    ),
    inputSchema: objectSchema({ id: string, status: string }, ["id", "status"]),
    call: (services, args) => {
      const body = arg(args);
      return route(services, "PATCH", `/contacts/${encodeURIComponent(id(body, "id"))}`, { status: body.status });
    },
  },
  {
    name: "create_list",
    description: describe("Creates an empty list.", "You want a named group of contacts."),
    inputSchema: objectSchema({ name: string }, ["name"]),
    call: (services, args) => route(services, "POST", "/lists", arg(args)),
  },
  {
    name: "list_lists",
    description: describe("Lists contact lists.", "You need a list id before enrolling or adding people."),
    inputSchema: objectSchema(pageProps, []),
    call: (services, args) => route(services, "GET", "/lists", undefined, queryArgs(arg(args))),
  },
  {
    name: "add_contacts_to_list",
    description: describe("Adds existing contacts to a list.", "The people already exist and should join a list."),
    inputSchema: objectSchema({ id: string, contact_ids: { type: "array", items: string } }, ["id", "contact_ids"]),
    call: (services, args) => {
      const body = arg(args);
      return route(services, "POST", `/lists/${encodeURIComponent(id(body, "id"))}/contacts`, {
        contact_ids: body.contact_ids,
      });
    },
  },
  {
    name: "create_campaign",
    description: describe("Creates a draft campaign.", "You are starting a new sequence and it must not send yet."),
    inputSchema: objectSchema({ name: string }, ["name"]),
    call: (services, args) => route(services, "POST", "/campaigns", arg(args)),
  },
  {
    name: "get_campaign",
    description: describe("Reads one campaign, including steps and mailbox ids.", "You need the current sequence before editing it."),
    inputSchema: objectSchema({ id: string }, ["id"]),
    call: (services, args) => route(services, "GET", `/campaigns/${encodeURIComponent(id(arg(args), "id"))}`, undefined),
  },
  {
    name: "update_campaign",
    description: describe("Changes a campaign's name or the mailboxes it rotates.", "You are editing a draft or choosing mailboxes."),
    inputSchema: objectSchema({ id: string, name: string, mailbox_ids: { type: "array", items: string } }, ["id"]),
    call: (services, args) => {
      const body = arg(args);
      const payload: Record<string, unknown> = {};
      if ("name" in body) payload.name = body.name;
      if ("mailbox_ids" in body) payload.mailbox_ids = body.mailbox_ids;
      return route(services, "PATCH", `/campaigns/${encodeURIComponent(id(body, "id"))}`, payload);
    },
  },
  {
    name: "add_campaign_step",
    description: describe(
      "Adds an email step. delay_days is the wait after the previous step. The first step uses 0.",
      "You are writing the sequence. Variables look like {{first_name|there}}.",
    ),
    inputSchema: objectSchema(
      { id: string, subject: string, body: string, delay_days: { type: "integer", minimum: 0 } },
      ["id", "subject", "body", "delay_days"],
    ),
    call: (services, args) => {
      const body = arg(args);
      return route(services, "POST", `/campaigns/${encodeURIComponent(id(body, "id"))}/steps`, {
        subject: body.subject,
        body: body.body,
        delay_days: body.delay_days,
      });
    },
  },
  {
    name: "update_campaign_step",
    description: describe("Updates a step's subject, body, or delay.", "You are revising a step that already exists."),
    inputSchema: objectSchema(
      { id: string, step_id: string, subject: string, body: string, delay_days: { type: "integer", minimum: 0 } },
      ["id", "step_id"],
    ),
    call: (services, args) => {
      const body = arg(args);
      const payload: Record<string, unknown> = {};
      if ("subject" in body) payload.subject = body.subject;
      if ("body" in body) payload.body = body.body;
      if ("delay_days" in body) payload.delay_days = body.delay_days;
      return route(
        services,
        "PATCH",
        `/campaigns/${encodeURIComponent(id(body, "id"))}/steps/${encodeURIComponent(id(body, "step_id"))}`,
        payload,
      );
    },
  },
  {
    name: "delete_campaign_step",
    description: describe("Deletes one step.", "A step should be removed from the sequence."),
    inputSchema: objectSchema({ id: string, step_id: string }, ["id", "step_id"]),
    call: (services, args) => {
      const body = arg(args);
      return route(
        services,
        "DELETE",
        `/campaigns/${encodeURIComponent(id(body, "id"))}/steps/${encodeURIComponent(id(body, "step_id"))}`,
        undefined,
      );
    },
  },
  {
    name: "start_campaign",
    description: describe(
      "Runs the launch check. On success the campaign becomes running and enrollments are created. This call sends nothing.",
      "A person has asked to launch, and the launch check should be read before anything else.",
    ),
    inputSchema: objectSchema({ id: string }, ["id"]),
    call: (services, args) =>
      route(services, "POST", `/campaigns/${encodeURIComponent(id(arg(args), "id"))}/start`, {}),
  },
  {
    name: "pause_campaign",
    description: describe("Pauses a running campaign so the scheduler stops taking it.", "Sends should stop without deleting the campaign."),
    inputSchema: objectSchema({ id: string }, ["id"]),
    call: (services, args) =>
      route(services, "POST", `/campaigns/${encodeURIComponent(id(arg(args), "id"))}/pause`, {}),
  },
  {
    name: "get_campaign_stats",
    description: describe(
      "Reads sent, replies, reply rate, bounces, unsubscribes, and who is still in sequence.",
      "You are reporting how a campaign is doing.",
    ),
    inputSchema: objectSchema({ id: string }, ["id"]),
    call: (services, args) =>
      route(services, "GET", `/campaigns/${encodeURIComponent(id(arg(args), "id"))}/stats`, undefined),
  },
  {
    name: "enroll",
    description: describe(
      "Enrolls contacts or a whole list. Suppressed and non-active contacts are not enrolled.",
      "The campaign exists and people should join it. Starting still happens separately.",
    ),
    inputSchema: objectSchema({ id: string, contact_ids: { type: "array", items: string }, list_id: string }, ["id"]),
    call: (services, args) => {
      const body = arg(args);
      const payload: Record<string, unknown> = {};
      if ("contact_ids" in body) payload.contact_ids = body.contact_ids;
      if ("list_id" in body) payload.list_id = body.list_id;
      return route(services, "POST", `/campaigns/${encodeURIComponent(id(body, "id"))}/enrollments`, payload);
    },
  },
  {
    name: "list_replies",
    description: describe("Lists replies, auto-replies, and bounces.", "You are triaging the inbox."),
    inputSchema: objectSchema(pageProps, []),
    call: (services, args) => route(services, "GET", "/replies", undefined, queryArgs(arg(args))),
  },
  {
    name: "get_reply_thread",
    description: describe("Reads one thread.", "You need the full conversation before drafting."),
    inputSchema: objectSchema({ id: string }, ["id"]),
    call: (services, args) => route(services, "GET", `/replies/${encodeURIComponent(id(arg(args), "id"))}`, undefined),
  },
  {
    name: "draft_reply",
    description: describe(
      "Saves a draft reply on a thread. A person sends it from the inbox. This tool does not send.",
      "You have reply copy ready and a person will review it before it goes out.",
    ),
    inputSchema: objectSchema({ id: string, body: string }, ["id", "body"]),
    call: (services, args) => {
      const body = arg(args);
      return route(services, "POST", `/replies/${encodeURIComponent(id(body, "id"))}/draft`, { body: body.body });
    },
  },
  {
    name: "list_mailboxes",
    description: describe("Lists mailboxes without credentials.", "You need a mailbox id or want to see which are paused."),
    inputSchema: objectSchema({}, []),
    call: (services) => route(services, "GET", "/mailboxes", undefined),
  },
  {
    name: "get_mailbox_health",
    description: describe(
      "Reads sent-today against today's cap, ramp day, pause reason, and health. The cap is read-only.",
      "You are checking whether a mailbox can send before a launch.",
    ),
    inputSchema: objectSchema({ id: string }, ["id"]),
    call: (services, args) =>
      route(services, "GET", `/mailboxes/${encodeURIComponent(id(arg(args), "id"))}/health`, undefined),
  },
];

export async function callMcpTool(
  services: AppServices,
  name: string,
  args: unknown,
): Promise<{ isError: boolean; text: string }> {
  const tool = MCP_TOOLS.find((item) => item.name === name);
  if (!tool) throw new ApiError(404, "unknown_tool", `Unknown tool ${name}.`);
  try {
    rejectLimitFields(args);
    const result = await tool.call(services, args ?? {});
    return { isError: result.status >= 400, text: JSON.stringify(result.body) };
  } catch (error) {
    if (error instanceof ApiError) return { isError: true, text: JSON.stringify(errorBody(error)) };
    throw error;
  }
}
