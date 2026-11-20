import { bodyText, hasUnsubscribeToken, type StepContentType } from "./template.js";

export const CAMPAIGN_STATES = ["draft", "running", "paused", "completed"] as const;
export type CampaignState = (typeof CAMPAIGN_STATES)[number];

export type LaunchStep = {
  position: number;
  subject: string;
  body: string;
  delayDays: number;
  contentType: StepContentType;
};

export type LaunchMailbox = {
  id: string;
  address: string;
  paused: boolean;
};

export type LaunchContact = {
  id: string;
  email: string;
  status: string;
  suppressed: boolean;
};

export type LaunchIssueCode =
  | "no_mailboxes"
  | "mailbox_missing"
  | "mailbox_paused"
  | "no_steps"
  | "empty_step"
  | "bad_delay"
  | "step_order"
  | "no_contacts"
  | "contacts_all_suppressed"
  | "missing_unsubscribe";

export type LaunchIssue = {
  code: LaunchIssueCode;
  message: string;
  blocking: boolean;
  stepPosition?: number;
  mailboxId?: string;
};

export type LaunchCheckInput = {
  steps: LaunchStep[];
  mailboxes: LaunchMailbox[];
  missingMailboxIds?: string[];
  contacts: LaunchContact[];
};

export function launchCheck(input: LaunchCheckInput): LaunchIssue[] {
  const issues: LaunchIssue[] = [];
  issues.push(...mailboxIssues(input.mailboxes, input.missingMailboxIds ?? []));
  issues.push(...stepIssues(input.steps));
  issues.push(...contactIssues(input.contacts));
  issues.push(...unsubscribeWarnings(input.steps));
  return issues;
}

export function blockingIssues(issues: LaunchIssue[]): LaunchIssue[] {
  return issues.filter((issue) => issue.blocking);
}

export function isSendableContact(contact: LaunchContact): boolean {
  return contact.status === "active" && !contact.suppressed;
}

function mailboxIssues(mailboxes: LaunchMailbox[], missingIds: string[]): LaunchIssue[] {
  if (mailboxes.length === 0 && missingIds.length === 0) {
    return [
      {
        code: "no_mailboxes",
        message: "Add at least one mailbox before launching.",
        blocking: true,
      },
    ];
  }
  const issues: LaunchIssue[] = [];
  for (const id of missingIds) {
    issues.push({
      code: "mailbox_missing",
      mailboxId: id,
      message: "A selected mailbox no longer exists. Remove it before launching.",
      blocking: true,
    });
  }
  for (const mailbox of mailboxes) {
    if (!mailbox.paused) continue;
    const label = mailbox.address.trim() || "A selected mailbox";
    issues.push({
      code: "mailbox_paused",
      mailboxId: mailbox.id,
      message: `${label} is paused. Reconnect it or remove it from this campaign before launching.`,
      blocking: true,
    });
  }
  return issues;
}

function stepIssues(steps: LaunchStep[]): LaunchIssue[] {
  if (steps.length === 0) {
    return [
      {
        code: "no_steps",
        message: "Add at least one email step before launching.",
        blocking: true,
      },
    ];
  }
  const issues: LaunchIssue[] = [];
  const ordered = [...steps].sort((a, b) => a.position - b.position);
  const positions = ordered.map((step) => step.position);
  const contiguous = positions.every((position, index) => position === index + 1);
  if (!contiguous) {
    issues.push({
      code: "step_order",
      message: "Number the steps from 1 upward with no gaps.",
      blocking: true,
    });
  }
  for (const step of ordered) {
    const label = `Step ${step.position}`;
    // A blank subject after step 1 is allowed. The schema stores that as null so
    // the sender can keep the previous subject and prefix "Re:".
    if (step.position === 1 && step.subject.trim().length === 0) {
      issues.push({
        code: "empty_step",
        stepPosition: step.position,
        message: `${label} needs a subject.`,
        blocking: true,
      });
    }
    if (bodyText(step).length === 0) {
      issues.push({
        code: "empty_step",
        stepPosition: step.position,
        message: `${label} needs a body.`,
        blocking: true,
      });
    }
    if (!isWholeDay(step.delayDays)) {
      issues.push({
        code: "bad_delay",
        stepPosition: step.position,
        message: `${label} delay must be a whole number of days, zero or more.`,
        blocking: true,
      });
    } else if (step.position === 1 && step.delayDays !== 0) {
      issues.push({
        code: "bad_delay",
        stepPosition: step.position,
        message: "The first step must send with no delay.",
        blocking: true,
      });
    }
  }
  return issues;
}

function contactIssues(contacts: LaunchContact[]): LaunchIssue[] {
  const unique = new Map<string, LaunchContact>();
  for (const contact of contacts) unique.set(contact.id, contact);
  if (unique.size === 0) {
    return [
      {
        code: "no_contacts",
        message: "Add at least one contact or list before launching.",
        blocking: true,
      },
    ];
  }
  const sendable = [...unique.values()].filter(isSendableContact);
  if (sendable.length === 0) {
    return [
      {
        code: "contacts_all_suppressed",
        message:
          "Every selected contact is suppressed or not sendable (replied, bounced, unsubscribed, invalid, or risky).",
        blocking: true,
      },
    ];
  }
  return [];
}

function unsubscribeWarnings(steps: LaunchStep[]): LaunchIssue[] {
  return [...steps]
    .sort((a, b) => a.position - b.position)
    .filter((step) => !hasUnsubscribeToken(step.body))
    .map((step) => ({
      code: "missing_unsubscribe" as const,
      stepPosition: step.position,
      message: `Step ${step.position} does not include {{unsubscribe_link}}, so that email will not show an unsubscribe line.`,
      blocking: false,
    }));
}

function isWholeDay(value: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
