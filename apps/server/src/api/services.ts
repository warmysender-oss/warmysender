export const CONTACT_STATUSES = ["active", "replied", "bounced", "unsubscribed", "invalid", "risky"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const CAMPAIGN_STATUSES = ["draft", "running", "paused", "completed"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export type Contact = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  custom_fields: Record<string, string>;
  status: ContactStatus;
};

export type ContactInput = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  custom_fields?: Record<string, string>;
};

export type ContactList = {
  id: string;
  name: string;
  contact_count: number;
};

export type CampaignStep = {
  id: string;
  position: number;
  subject: string;
  body: string;
  delay_days: number;
};

export type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  mailbox_ids: string[];
  steps: CampaignStep[];
};

export type StepStats = {
  step_id: string;
  position: number;
  sent: number;
  replies: number;
  bounces: number;
  unsubscribes: number;
};

export type CampaignStats = {
  campaign_id: string;
  sent: number;
  replies: number;
  reply_rate: number | null;
  bounces: number;
  unsubscribes: number;
  still_in_sequence: number;
  steps: StepStats[];
};

export type ReplyKind = "reply" | "auto_reply" | "bounce";

export type ReplySummary = {
  id: string;
  mailbox_id: string;
  contact_id: string | null;
  from_email: string;
  subject: string;
  received_at: string;
  kind: ReplyKind;
};

export type ThreadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  from_email: string;
  subject: string;
  body: string;
  at: string;
};

export type ReplyThread = ReplySummary & { messages: ThreadMessage[] };

export type ReplyDraft = {
  id: string;
  reply_id: string;
  body: string;
  created_at: string;
};

export type MailboxSummary = {
  id: string;
  email: string;
  provider: "smtp" | "microsoft";
  paused: boolean;
  paused_reason: string | null;
};

export type MailboxHealth = MailboxSummary & {
  sent_today: number;
  cap_today: number;
  ramp_day: number | null;
  health: string;
};

export type Page<T> = { items: T[]; next_cursor: string | null };

export type PageQuery = { cursor?: string; limit?: number };

/**
 * Ports the REST and MCP layers call. Implementations live in the other tasks.
 * `campaigns.start` flips state and creates enrollments. It does not send.
 * Nothing on this interface accepts a daily cap, gap, window, or ramp override.
 */
export interface AppServices {
  contacts: {
    create(input: ContactInput): Promise<Contact>;
    bulkCreate(inputs: ContactInput[]): Promise<{ created: Contact[]; skipped: { email: string; reason: string }[] }>;
    list(args: PageQuery & { status?: ContactStatus }): Promise<Page<Contact>>;
    updateStatus(id: string, status: ContactStatus): Promise<Contact | null>;
    findByEmails(emails: string[]): Promise<Contact[]>;
  };
  lists: {
    create(name: string): Promise<ContactList>;
    list(args: PageQuery): Promise<Page<ContactList>>;
    addContacts(listId: string, contactIds: string[]): Promise<{ added: number } | null>;
    emails(listId: string): Promise<string[] | null>;
  };
  campaigns: {
    create(input: { name: string }): Promise<Campaign>;
    get(id: string): Promise<Campaign | null>;
    update(id: string, input: { name?: string; mailbox_ids?: string[] }): Promise<Campaign | null>;
    addStep(campaignId: string, input: { subject: string; body: string; delay_days: number }): Promise<CampaignStep | null>;
    updateStep(
      campaignId: string,
      stepId: string,
      input: { subject?: string; body?: string; delay_days?: number },
    ): Promise<CampaignStep | null>;
    deleteStep(campaignId: string, stepId: string): Promise<boolean>;
    start(id: string): Promise<{ started: boolean; problems: string[]; campaign: Campaign | null } | null>;
    pause(id: string): Promise<Campaign | null>;
    stats(id: string): Promise<CampaignStats | null>;
  };
  enrollments: {
    enroll(campaignId: string, input: { contact_ids?: string[]; list_id?: string }): Promise<{ enrolled: number } | null>;
  };
  replies: {
    list(args: PageQuery): Promise<Page<ReplySummary>>;
    getThread(id: string): Promise<ReplyThread | null>;
    saveDraft(replyId: string, body: string): Promise<ReplyDraft | null>;
  };
  mailboxes: {
    list(): Promise<MailboxSummary[]>;
    health(id: string): Promise<MailboxHealth | null>;
  };
}
