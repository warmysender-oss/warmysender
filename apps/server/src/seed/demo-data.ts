/** Seeded demo records. Every address is a .test domain. Nothing here can log in to a real mailbox. */

export type DemoContact = {
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  custom_fields: Record<string, string>;
};

export type DemoStep = {
  position: number;
  delay_days: number;
  subject: string;
  body: string;
};

export const DEMO_LIST_NAME = "Harbor Dental — intro";

export const DEMO_MAILBOX = {
  email: "ava@harbor-dental.test",
  from_name: "Ava Chen",
  provider: "smtp" as const,
  smtp_host: "smtp.harbor-dental.test",
  smtp_port: 587,
  imap_host: "imap.harbor-dental.test",
  imap_port: 993,
};

export const DEMO_CONTACTS: readonly DemoContact[] = [
  {
    email: "jane@harbor-dental.test",
    first_name: "Jane",
    last_name: "Harbor",
    company: "Harbor Dental",
    title: "Owner",
    custom_fields: { city: "Seaside" },
  },
  {
    email: "sam@north-pier.test",
    first_name: "Sam",
    last_name: "Pier",
    company: "North Pier",
    title: "Office manager",
    custom_fields: { city: "Seaside" },
  },
  {
    email: "riley@lumen-labs.test",
    first_name: "Riley",
    last_name: "Lumen",
    company: "Lumen Labs",
    title: "Founder",
    custom_fields: {},
  },
];

export const DEMO_CAMPAIGN = {
  name: "Harbor intro",
  status: "draft" as const,
  steps: [
    {
      position: 1,
      delay_days: 0,
      subject: "Quick question for {{company|your team}}",
      body: "Hi {{first_name|there}} — I had a short idea for {{company|your team}}.\n\n{{unsubscribe_link}}",
    },
    {
      position: 2,
      delay_days: 3,
      subject: "Re: Quick question for {{company|your team}}",
      body: "Hi {{first_name|there}} — circling back in case this is useful.\n\n{{unsubscribe_link}}",
    },
    {
      position: 3,
      delay_days: 4,
      subject: "Re: Quick question for {{company|your team}}",
      body: "Hi {{first_name|there}} — I'll close the loop here.\n\n{{unsubscribe_link}}",
    },
  ] satisfies readonly DemoStep[],
};

export type DemoSeedStore = {
  hasDemo(): Promise<boolean>;
  insertMailbox(mailbox: typeof DEMO_MAILBOX): Promise<string>;
  insertContacts(contacts: readonly DemoContact[]): Promise<string[]>;
  insertList(name: string, contactIds: string[]): Promise<string>;
  insertCampaign(campaign: typeof DEMO_CAMPAIGN, mailboxId: string): Promise<string>;
};

export async function seedDemo(store: DemoSeedStore): Promise<{ inserted: boolean; campaign_id?: string }> {
  assertDemoDomains();
  if (await store.hasDemo()) return { inserted: false };
  const mailboxId = await store.insertMailbox(DEMO_MAILBOX);
  const contactIds = await store.insertContacts(DEMO_CONTACTS);
  await store.insertList(DEMO_LIST_NAME, contactIds);
  const campaignId = await store.insertCampaign(DEMO_CAMPAIGN, mailboxId);
  return { inserted: true, campaign_id: campaignId };
}

export function assertDemoDomains(): void {
  const emails = [DEMO_MAILBOX.email, ...DEMO_CONTACTS.map((contact) => contact.email)];
  for (const email of emails) {
    if (!email.endsWith(".test")) throw new Error("Demo data must use .test domains.");
  }
}
