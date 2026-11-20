export type FirstRunStepId = "connect_mailbox" | "dns_check" | "import_csv" | "first_campaign";

export interface FirstRunInput {
  mailboxCount: number;
  dnsCheckedMailboxCount: number;
  contactCount: number;
  campaignCount: number;
  demoCampaignAvailable: boolean;
}

export interface FirstRunStepView {
  id: FirstRunStepId;
  title: string;
  detail: string;
  done: boolean;
}

export interface FirstRunView {
  steps: FirstRunStepView[];
  completedCount: number;
  total: number;
  nextStepId: FirstRunStepId | null;
  demo: { title: string; body: string } | null;
}

const STEPS: Array<{ id: FirstRunStepId; title: string; detail: string; done: (input: FirstRunInput) => boolean }> = [
  {
    id: "connect_mailbox",
    title: "Connect a mailbox",
    detail: "Add the mailbox that will send.",
    done: (input) => input.mailboxCount >= 1,
  },
  {
    id: "dns_check",
    title: "Check DNS",
    detail: "SPF, DKIM, DMARC and MX for the sending domain.",
    done: (input) => input.dnsCheckedMailboxCount >= 1,
  },
  {
    id: "import_csv",
    title: "Import a CSV",
    detail: "Bring in contacts. Duplicates and suppressed addresses are skipped.",
    done: (input) => input.contactCount >= 1,
  },
  {
    id: "first_campaign",
    title: "Create your first campaign",
    detail: "Build the sequence, then launch it when the checks pass.",
    done: (input) => input.campaignCount >= 1,
  },
];

/** Spec §7 first-run order: connect mailbox, DNS check, import CSV, first campaign. */
export function firstRunView(input: FirstRunInput): FirstRunView {
  const steps = STEPS.map((step) => ({
    id: step.id,
    title: step.title,
    detail: step.detail,
    done: step.done(input),
  }));
  const next = steps.find((step) => !step.done);
  return {
    steps,
    completedCount: steps.filter((step) => step.done).length,
    total: steps.length,
    nextStepId: next?.id ?? null,
    demo: input.demoCampaignAvailable
      ? {
          title: "Explore the demo campaign",
          body: "A seeded campaign with .test contacts is ready to click through.",
        }
      : null,
  };
}
