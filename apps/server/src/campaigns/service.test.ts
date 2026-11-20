import { describe, expect, it } from "vitest";
import { createMemoryContactStore } from "../contacts/memory-store.js";
import { createMemoryCampaignStore } from "./memory-store.js";
import {
  addStep,
  checkLaunch,
  createCampaign,
  pauseCampaign,
  previewCampaignStep,
  setCampaignAudience,
  setCampaignMailboxes,
  startCampaign,
  updateStep,
} from "./service.js";
import type { CampaignDeps } from "./service.js";

function deps(options?: { paused?: boolean }): CampaignDeps & { campaigns: ReturnType<typeof createMemoryCampaignStore> } {
  let n = 0;
  const contacts = createMemoryContactStore();
  const campaigns = createMemoryCampaignStore([
    { id: "mbx_1", address: "ada@studio.test", paused: options?.paused ?? false },
  ]);
  return {
    campaigns,
    contacts,
    id: () => `id_${++n}`,
    nowIso: () => "2026-11-20T12:00:00.000Z",
    publicUrl: "https://app.test",
  };
}

describe("campaign service", () => {
  it("previews a real contact, refuses a broken launch, then starts and pauses without sending", async () => {
    const app = deps();
    await app.contacts.insertContacts([
      {
        id: "con_1",
        email: "jane@harbor-dental.test",
        firstName: "Jane",
        lastName: null,
        company: "Harbor Dental",
        title: null,
        customFields: { city: "Lisbon" },
        status: "active",
      },
      {
        id: "con_2",
        email: "sam@blocked.test",
        firstName: "Sam",
        lastName: null,
        company: null,
        title: null,
        customFields: {},
        status: "active",
      },
    ]);
    await app.contacts.insertList({ id: "list_1", name: "Clinics" });
    await app.contacts.insertMemberships([{ listId: "list_1", contactId: "con_2" }]);
    await app.contacts.insertSuppression({ id: "sup_1", kind: "domain", value: "blocked.test" });

    const campaign = await createCampaign(app, "Harbor intro");
    const bare = await addStep(app, campaign.id, {});
    expect(bare.body).toContain("{{unsubscribe_link}}");
    expect(bare.delayDays).toBe(0);
    await app.campaigns.deleteStep(bare.id);
    const step = await addStep(app, campaign.id, {
      subject: "Hi {{first_name|there}}",
      body: "We help {{company}} in {{city}}.\n{{unsubscribe_link}}",
      contentType: "text",
    });
    await expect(updateStep(app, campaign.id, step.id, { delayDays: 4 })).rejects.toThrow(
      /first step must send with no delay/,
    );
    const saved = await app.campaigns.listSteps(campaign.id);
    expect(saved[0]?.delayDays).toBe(0);

    const preview = await previewCampaignStep(app, campaign.id, step.id, "con_1");
    expect(preview.subject).toBe("Hi Jane");
    expect(preview.body).toContain("Harbor Dental");
    expect(preview.body).toContain("Lisbon");
    expect(preview.body).toContain("https://app.test/u/preview");

    await setCampaignAudience(app, campaign.id, { contactIds: ["con_1"], listIds: ["list_1"] });
    const blocked = await checkLaunch(app, campaign.id);
    expect(blocked.map((issue) => issue.code)).toContain("no_mailboxes");

    await setCampaignMailboxes(app, campaign.id, ["mbx_1"]);
    expect((await checkLaunch(app, campaign.id)).filter((issue) => issue.blocking)).toEqual([]);

    const started = await startCampaign(app, campaign.id);
    expect(started).toEqual({ state: "running", enrollmentsCreated: 1, warnings: [] });
    const enrollments = await app.campaigns.listEnrollments(campaign.id);
    expect(enrollments).toEqual([
      {
        id: expect.stringMatching(/^id_/),
        campaignId: campaign.id,
        contactId: "con_1",
        status: "active",
        currentStep: 1,
        nextSendAt: "2026-11-20T12:00:00.000Z",
        mailboxId: null,
      },
    ]);

    await pauseCampaign(app, campaign.id);
    expect((await app.campaigns.getCampaign(campaign.id))?.state).toBe("paused");
    expect(await app.campaigns.listEnrollments(campaign.id)).toEqual(enrollments);

    const resumed = await startCampaign(app, campaign.id);
    expect(resumed.enrollmentsCreated).toBe(0);
    expect(await app.campaigns.listEnrollments(campaign.id)).toHaveLength(1);
  });

  it("refuses to start while a selected mailbox is paused", async () => {
    const app = deps({ paused: true });
    await app.contacts.insertContacts([
      {
        id: "con_1",
        email: "jane@harbor-dental.test",
        firstName: "Jane",
        lastName: null,
        company: null,
        title: null,
        customFields: {},
        status: "active",
      },
    ]);
    const campaign = await createCampaign(app, "Paused mailbox");
    await addStep(app, campaign.id, {
      subject: "Hello",
      body: "Hi\n{{unsubscribe_link}}",
    });
    await setCampaignMailboxes(app, campaign.id, ["mbx_1"]);
    await setCampaignAudience(app, campaign.id, { contactIds: ["con_1"], listIds: [] });
    await expect(startCampaign(app, campaign.id)).rejects.toThrow(/ada@studio.test is paused/);
    expect((await app.campaigns.getCampaign(campaign.id))?.state).toBe("draft");
    expect(await app.campaigns.listEnrollments(campaign.id)).toEqual([]);
  });
});
