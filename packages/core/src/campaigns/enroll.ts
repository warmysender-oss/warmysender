import {
  blockingIssues,
  isSendableContact,
  type CampaignState,
  type LaunchContact,
  type LaunchIssue,
} from "./launch-check.js";

/**
 * Rows created when a campaign starts. Task 05 sends them.
 * currentStep 1 means the next step to send is step 1.
 * mailboxId stays empty until the mailbox that sends step 1 is chosen.
 * Pause only changes the campaign state; these rows stay as they are.
 */
export type NewEnrollment = {
  contactId: string;
  status: "active";
  currentStep: 1;
  nextSendAt: string;
  mailboxId: null;
};

export type ExistingEnrollment = {
  contactId: string;
};

export type StartPlan =
  | {
      ok: true;
      state: "running";
      enrollments: NewEnrollment[];
      warnings: LaunchIssue[];
    }
  | { ok: false; error: string; issues: LaunchIssue[] };

export type PausePlan = { ok: true; state: "paused" } | { ok: false; error: string };

export function planStart(input: {
  state: CampaignState;
  contacts: LaunchContact[];
  existingEnrollments: ExistingEnrollment[];
  issues: LaunchIssue[];
  nowIso: string;
}): StartPlan {
  const blocking = blockingIssues(input.issues);
  if (blocking.length > 0) {
    return { ok: false, error: blocking[0]?.message ?? "Fix the launch check before starting.", issues: input.issues };
  }
  const allowed = canStart(input.state);
  if (!allowed.ok) return { ok: false, error: allowed.error, issues: input.issues };
  return {
    ok: true,
    state: "running",
    enrollments: enrollableContacts(input.contacts, input.existingEnrollments).map((contact) => ({
      contactId: contact.id,
      status: "active" as const,
      currentStep: 1 as const,
      nextSendAt: input.nowIso,
      mailboxId: null,
    })),
    warnings: input.issues.filter((issue) => !issue.blocking),
  };
}

export function planPause(state: CampaignState): PausePlan {
  if (state === "running") return { ok: true, state: "paused" };
  if (state === "paused") return { ok: false, error: "This campaign is already paused." };
  if (state === "draft") {
    return { ok: false, error: "This campaign is still a draft. Start it before pausing." };
  }
  return { ok: false, error: "This campaign is completed and cannot be paused." };
}

export function canStart(state: CampaignState): { ok: true } | { ok: false; error: string } {
  if (state === "draft" || state === "paused") return { ok: true };
  if (state === "running") return { ok: false, error: "This campaign is already running." };
  return { ok: false, error: "This campaign is completed and cannot be started." };
}

export function enrollableContacts(
  contacts: LaunchContact[],
  existingEnrollments: ExistingEnrollment[],
): LaunchContact[] {
  const already = new Set(existingEnrollments.map((row) => row.contactId));
  const seen = new Set<string>();
  const chosen: LaunchContact[] = [];
  for (const contact of contacts) {
    if (!isSendableContact(contact)) continue;
    if (already.has(contact.id) || seen.has(contact.id)) continue;
    seen.add(contact.id);
    chosen.push(contact);
  }
  return chosen;
}
