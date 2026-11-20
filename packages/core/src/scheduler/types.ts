export type ContactStatus =
  | "active"
  | "replied"
  | "bounced"
  | "unsubscribed"
  | "invalid"
  | "risky";

export type CampaignStatus = "draft" | "running" | "paused" | "completed";

export type EnrollmentStatus = "active" | "stopped" | "completed" | "paused";

export type SkipReason =
  | "outside_window"
  | "not_sending_day"
  | "daily_cap"
  | "gap_not_elapsed"
  | "one_at_a_time"
  | "mailbox_busy"
  | "mailbox_paused"
  | "campaign_not_running"
  | "enrollment_not_active"
  | "not_due"
  | "contact_replied"
  | "contact_bounced"
  | "contact_unsubscribed"
  | "contact_not_active"
  | "suppressed"
  | "invalid_schedule"
  | "invalid_recipient"
  | "invalid_unsubscribe_url"
  | "missing_subject"
  | "missing_thread"
  | "unknown_mailbox"
  | "send_failed"
  | "retry_waiting";

/**
 * Mailbox as the scheduler sees it. Task 01's schema is mapped into this
 * shape by the worker; the rules do not read database columns directly.
 */
export type MailboxSnapshot = {
  id: string;
  fromAddress: string;
  fromName: string | null;
  timezone: string;
  /** ISO weekdays, 1 = Monday … 7 = Sunday, in the mailbox timezone. */
  sendingDays: readonly number[];
  /**
   * Local HH:mm, 24-hour. Start is inclusive and end is exclusive.
   * When start and end are equal the window is the whole local day.
   */
  windowStart: string;
  windowEnd: string;
  /** Configured cap before ramp and before the hard max of 50. */
  dailyCap: number;
  minGapMinutes: number;
  maxGapMinutes: number;
  /** YYYY-MM-DD, the calendar date ramp day 1 begins in the mailbox timezone. */
  rampStartedOn: string;
  paused: boolean;
  consecutiveAuthFailures: number;
  /** SMTP policy blocks (5.7.x). Reset on a successful send. */
  consecutivePolicyFailures: number;
  /** Appended to the body when it is not empty. */
  signature: string;
  /** Successful send instants. The daily cap counts those on today's local date. */
  sentAtTimes: readonly Date[];
  /**
   * Gap chosen after the latest successful send.
   * Null when the mailbox has never sent, or when the chosen gap was not stored.
   */
  nextGapMinutes: number | null;
};

export type SuppressionEntry = {
  kind: "email" | "domain";
  value: string;
};

export type FollowingStep = {
  stepNumber: number;
  delayDays: number;
};

export type SendCandidate = {
  enrollmentId: string;
  enrollmentStatus: EnrollmentStatus;
  campaignId: string;
  campaignStatus: CampaignStatus;
  contactId: string;
  contactEmail: string;
  contactStatus: ContactStatus;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  customFields: Readonly<Record<string, string | null | undefined>>;
  /** Null until step 1 is assigned. Follow-ups keep the step 1 mailbox. */
  mailboxId: string | null;
  /** Campaign mailboxes step 1 may rotate across. Ignored once mailboxId is set. */
  mailboxChoices: readonly string[];
  stepId: string;
  stepNumber: number;
  dueAt: Date;
  /** Transient SMTP attempts already used for this step. */
  attempts: number;
  /** When set and still in the future, the step is waiting on backoff. */
  retryAt: Date | null;
  /** Empty or null on a follow-up means "keep the thread subject". */
  stepSubject: string | null;
  previousMessageId: string | null;
  previousReferences: string | null;
  previousSubject: string | null;
  fromAddress: string;
  fromName: string | null;
  toName: string | null;
  bodyText: string;
  bodyHtml: string | null;
  publicUrl: string;
  unsubscribeToken: string;
  /** The next sequence step, or null when this send is the last step. */
  nextStep: FollowingStep | null;
};

export type SkipDecision = {
  action: "skip";
  reason: SkipReason;
  mailboxId: string | null;
  enrollmentId: string | null;
  contactId: string | null;
  log: string;
};

export type SendDecision = {
  action: "send";
  mailboxId: string;
  enrollmentId: string;
  contactId: string;
  campaignId: string;
  stepId: string;
  stepNumber: number;
  effectiveCap: number;
  sentToday: number;
  candidate: SendCandidate;
};

export type PlanResult = {
  sends: SendDecision[];
  skips: SkipDecision[];
};
