export type ApiRoute = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  operationId: string;
  summary: string;
  description: string;
  tag: string;
};

const SAFETY =
  "Does not send a message. Cannot raise a daily cap, ramp, sending window, or gap. The scheduler sends inside those limits.";

export const API_ROUTES: readonly ApiRoute[] = [
  {
    method: "GET",
    path: "/openapi.json",
    operationId: "getOpenApi",
    summary: "OpenAPI document",
    description: "This API. " + SAFETY,
    tag: "Meta",
  },
  {
    method: "POST",
    path: "/contacts",
    operationId: "createContact",
    summary: "Create a contact",
    description: "Adds one contact. Email is stored lower-cased. " + SAFETY,
    tag: "Contacts",
  },
  {
    method: "POST",
    path: "/contacts/bulk",
    operationId: "bulkCreateContacts",
    summary: "Create contacts in bulk",
    description: "Adds many contacts. Invalid addresses, duplicates, and suppressed addresses are skipped and counted. " + SAFETY,
    tag: "Contacts",
  },
  {
    method: "GET",
    path: "/contacts",
    operationId: "listContacts",
    summary: "List contacts",
    description: "Cursor-paginated contacts. Optional status filter. " + SAFETY,
    tag: "Contacts",
  },
  {
    method: "PATCH",
    path: "/contacts/{id}",
    operationId: "updateContactStatus",
    summary: "Update a contact's status",
    description:
      "Sets status to active, replied, bounced, unsubscribed, invalid, or risky. Bounced and unsubscribed contacts are added to the suppression list. " +
      SAFETY,
    tag: "Contacts",
  },
  {
    method: "POST",
    path: "/lists",
    operationId: "createList",
    summary: "Create a list",
    description: "Creates an empty contact list. " + SAFETY,
    tag: "Lists",
  },
  {
    method: "GET",
    path: "/lists",
    operationId: "listLists",
    summary: "List lists",
    description: "Cursor-paginated lists. " + SAFETY,
    tag: "Lists",
  },
  {
    method: "POST",
    path: "/lists/{id}/contacts",
    operationId: "addContactsToList",
    summary: "Add contacts to a list",
    description: "Adds existing contacts to a list. A contact can be on many lists. " + SAFETY,
    tag: "Lists",
  },
  {
    method: "POST",
    path: "/campaigns",
    operationId: "createCampaign",
    summary: "Create a campaign",
    description: "Creates a draft campaign. " + SAFETY,
    tag: "Campaigns",
  },
  {
    method: "GET",
    path: "/campaigns/{id}",
    operationId: "getCampaign",
    summary: "Get a campaign",
    description: "Returns the campaign, its steps, and the mailboxes it rotates. " + SAFETY,
    tag: "Campaigns",
  },
  {
    method: "PATCH",
    path: "/campaigns/{id}",
    operationId: "updateCampaign",
    summary: "Update a campaign",
    description: "Changes the name or the mailboxes the campaign rotates. " + SAFETY,
    tag: "Campaigns",
  },
  {
    method: "POST",
    path: "/campaigns/{id}/steps",
    operationId: "addCampaignStep",
    summary: "Add a step",
    description: "Adds an email step. delay_days is the wait after the previous step. Step 1 uses 0. " + SAFETY,
    tag: "Campaigns",
  },
  {
    method: "PATCH",
    path: "/campaigns/{id}/steps/{stepId}",
    operationId: "updateCampaignStep",
    summary: "Update a step",
    description: "Changes a step's subject, body, or delay. " + SAFETY,
    tag: "Campaigns",
  },
  {
    method: "DELETE",
    path: "/campaigns/{id}/steps/{stepId}",
    operationId: "deleteCampaignStep",
    summary: "Delete a step",
    description: "Removes a step. " + SAFETY,
    tag: "Campaigns",
  },
  {
    method: "POST",
    path: "/campaigns/{id}/start",
    operationId: "startCampaign",
    summary: "Start a campaign",
    description:
      "Runs the launch check. When it passes, the campaign becomes running and enrollments are created. Nothing is sent by this call. " +
      SAFETY,
    tag: "Campaigns",
  },
  {
    method: "POST",
    path: "/campaigns/{id}/pause",
    operationId: "pauseCampaign",
    summary: "Pause a campaign",
    description: "Pauses a running campaign so the scheduler stops taking new sends. " + SAFETY,
    tag: "Campaigns",
  },
  {
    method: "GET",
    path: "/campaigns/{id}/stats",
    operationId: "getCampaignStats",
    summary: "Campaign stats",
    description: "Sent, replies, reply rate, bounces, unsubscribes, and who is still in the sequence, per step. " + SAFETY,
    tag: "Campaigns",
  },
  {
    method: "POST",
    path: "/campaigns/{id}/enrollments",
    operationId: "enroll",
    summary: "Enroll contacts",
    description:
      "Adds contacts or a list to the campaign audience. Suppressed and non-active contacts are not counted. Start creates the enrollment rows. " +
      SAFETY,
    tag: "Enrollments",
  },
  {
    method: "GET",
    path: "/replies",
    operationId: "listReplies",
    summary: "List replies",
    description: "Replies, auto-replies, and bounces across mailboxes. " + SAFETY,
    tag: "Replies",
  },
  {
    method: "GET",
    path: "/replies/{id}",
    operationId: "getReplyThread",
    summary: "Get a thread",
    description: "One inbound message and the thread around it. " + SAFETY,
    tag: "Replies",
  },
  {
    method: "POST",
    path: "/replies/{id}/draft",
    operationId: "draftReply",
    summary: "Save a draft reply",
    description: "Saves a draft a person sends from the inbox. This does not send. " + SAFETY,
    tag: "Replies",
  },
  {
    method: "GET",
    path: "/mailboxes",
    operationId: "listMailboxes",
    summary: "List mailboxes",
    description: "Mailboxes without credentials. " + SAFETY,
    tag: "Mailboxes",
  },
  {
    method: "GET",
    path: "/mailboxes/{id}/health",
    operationId: "getMailboxHealth",
    summary: "Mailbox health",
    description: "Sent today against today's cap (ramp included), ramp day, pause reason, and health. The cap is read-only. " + SAFETY,
    tag: "Mailboxes",
  },
];
