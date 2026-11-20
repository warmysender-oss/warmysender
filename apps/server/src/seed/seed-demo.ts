import { eq } from "drizzle-orm";
import {
  campaignMailboxes,
  campaignSteps,
  campaigns,
  contacts,
  encryptString,
  listMembers,
  lists,
  mailboxes,
  type AppDatabase,
} from "@warmysender/core";
import { DEMO_CAMPAIGN, DEMO_CONTACTS, DEMO_LIST_NAME, DEMO_MAILBOX, seedDemo } from "./demo-data.js";

/** Inserts the .test demo when those contacts are absent. Never called in production. */
export async function seedDemoIfEmpty(db: AppDatabase, encryptionKey: Buffer): Promise<{ inserted: boolean }> {
  return seedDemo({
    async hasDemo() {
      const email = DEMO_CONTACTS[0]?.email;
      if (!email) return true;
      const rows = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.email, email)).limit(1);
      return rows.length > 0;
    },
    async insertMailbox(mailbox) {
      const [row] = await db
        .insert(mailboxes)
        .values({
          email: mailbox.email,
          fromName: mailbox.from_name,
          provider: mailbox.provider,
          smtpHost: mailbox.smtp_host,
          smtpPort: mailbox.smtp_port,
          smtpUsername: mailbox.email,
          imapHost: mailbox.imap_host,
          imapPort: mailbox.imap_port,
          imapUsername: mailbox.email,
          smtpPasswordEncrypted: encryptString("demo-not-a-login", encryptionKey),
          imapPasswordEncrypted: encryptString("demo-not-a-login", encryptionKey),
        })
        .returning();
      if (!row) throw new Error("Demo mailbox was not saved.");
      return row.id;
    },
    async insertContacts(rows) {
      const ids: string[] = [];
      for (const contact of rows) {
        const [row] = await db
          .insert(contacts)
          .values({
            email: contact.email,
            firstName: contact.first_name,
            lastName: contact.last_name,
            company: contact.company,
            title: contact.title,
            customFields: contact.custom_fields,
          })
          .returning();
        if (!row) throw new Error("Demo contact was not saved.");
        ids.push(row.id);
      }
      return ids;
    },
    async insertList(name, contactIds) {
      const [row] = await db.insert(lists).values({ name }).returning();
      if (!row) throw new Error("Demo list was not saved.");
      if (contactIds.length > 0) {
        await db.insert(listMembers).values(contactIds.map((contactId) => ({ listId: row.id, contactId })));
      }
      return row.id;
    },
    async insertCampaign(campaign, mailboxId) {
      const [row] = await db.insert(campaigns).values({ name: campaign.name, status: campaign.status }).returning();
      if (!row) throw new Error("Demo campaign was not saved.");
      await db.insert(campaignSteps).values(
        campaign.steps.map((step) => ({
          campaignId: row.id,
          position: step.position,
          subject: step.subject,
          body: step.body,
          delayDays: step.delay_days,
        })),
      );
      await db.insert(campaignMailboxes).values({ campaignId: row.id, mailboxId });
      return row.id;
    },
  });
}

export { DEMO_CAMPAIGN, DEMO_CONTACTS, DEMO_LIST_NAME, DEMO_MAILBOX };
