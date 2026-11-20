import { Router } from "express";
import { mailboxes, type AppDatabase } from "@warmysender/core";
import { HttpError } from "../http.js";
import { requireUser } from "../middleware.js";
import { UserInputError } from "../contacts/service.js";
import { createDrizzleContactStore } from "../contacts/db.js";
import { createDrizzleCampaignStore } from "./db.js";
import {
  addStep,
  checkLaunch,
  createCampaign,
  deleteCampaign,
  deleteStep,
  listCampaignDetails,
  pauseCampaign,
  previewCampaignStep,
  renameCampaign,
  setCampaignAudience,
  setCampaignMailboxes,
  startCampaign,
  updateStep,
  type CampaignDeps,
} from "./service.js";

export function campaignsRouter(db: AppDatabase, publicUrl: string): Router {
  const router = Router();
  router.use(requireUser);
  const deps: CampaignDeps = {
    campaigns: createDrizzleCampaignStore(db),
    contacts: createDrizzleContactStore(db),
    id: () => crypto.randomUUID(),
    nowIso: () => new Date().toISOString(),
    publicUrl,
  };

  router.get("/", async (_req, res, next) => {
    try {
      const [campaigns, mailboxes, contacts, lists] = await Promise.all([
        listCampaignDetails(deps),
        deps.campaigns.listMailboxes(await allMailboxIds(db)),
        deps.contacts.listContacts(),
        deps.contacts.listLists(),
      ]);
      res.json({
        campaigns: campaigns.map(({ steps: _steps, ...campaign }) => campaign),
        mailboxes,
        contacts: contacts.map((contact) => ({
          id: contact.id,
          email: contact.email,
          firstName: contact.firstName,
          company: contact.company,
          status: contact.status,
        })),
        lists,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name : "";
      const campaign = await createCampaign(deps, name, req.user?.id ?? null);
      res.status(201).json({ campaign });
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const campaign = await requireDetail(deps, routeId(req.params.id));
      res.json({ campaign });
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name : "";
      const campaign = await renameCampaign(deps, routeId(req.params.id), name);
      res.json({ campaign });
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      await deleteCampaign(deps, routeId(req.params.id));
      res.status(204).end();
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.post("/:id/steps", async (req, res, next) => {
    try {
      const step = await addStep(deps, routeId(req.params.id), readStep(req.body));
      res.status(201).json({ step });
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.patch("/:id/steps/:stepId", async (req, res, next) => {
    try {
      const step = await updateStep(deps, routeId(req.params.id), routeId(req.params.stepId), readStep(req.body));
      res.json({ step });
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.delete("/:id/steps/:stepId", async (req, res, next) => {
    try {
      const steps = await deleteStep(deps, routeId(req.params.id), routeId(req.params.stepId));
      res.json({ steps });
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.put("/:id/mailboxes", async (req, res, next) => {
    try {
      const campaign = await setCampaignMailboxes(deps, routeId(req.params.id), readStringArray(req.body?.mailboxIds));
      res.json({ campaign });
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.put("/:id/audience", async (req, res, next) => {
    try {
      const campaign = await setCampaignAudience(deps, routeId(req.params.id), {
        contactIds: readStringArray(req.body?.contactIds),
        listIds: readStringArray(req.body?.listIds),
      });
      res.json({ campaign });
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.post("/:id/preview", async (req, res, next) => {
    try {
      const stepId = typeof req.body?.stepId === "string" ? req.body.stepId : "";
      const contactId = typeof req.body?.contactId === "string" ? req.body.contactId : "";
      const preview = await previewCampaignStep(deps, routeId(req.params.id), stepId, contactId);
      res.json({ preview, previewStepId: stepId });
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.post("/:id/launch-check", async (req, res, next) => {
    try {
      const issues = await checkLaunch(deps, routeId(req.params.id));
      res.json({ issues });
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.post("/:id/start", async (req, res, next) => {
    try {
      const result = await startCampaign(deps, routeId(req.params.id));
      res.json(result);
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.post("/:id/pause", async (req, res, next) => {
    try {
      const result = await pauseCampaign(deps, routeId(req.params.id));
      res.json(result);
    } catch (error) {
      next(asHttp(error));
    }
  });

  return router;
}

async function allMailboxIds(db: AppDatabase): Promise<string[]> {
  const rows = await db.select({ id: mailboxes.id }).from(mailboxes);
  return rows.map((row) => row.id);
}

async function requireDetail(deps: CampaignDeps, campaignId: string) {
  const campaigns = await listCampaignDetails(deps);
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new UserInputError("Campaign not found.");
  return campaign;
}

function readStep(body: unknown): { subject?: string; body?: string; delayDays?: number; contentType?: string } {
  if (typeof body !== "object" || body === null) return {};
  const record = body as { subject?: unknown; body?: unknown; delayDays?: unknown; contentType?: unknown };
  return {
    subject: typeof record.subject === "string" ? record.subject : undefined,
    body: typeof record.body === "string" ? record.body : undefined,
    delayDays: typeof record.delayDays === "number" ? record.delayDays : undefined,
    contentType: typeof record.contentType === "string" ? record.contentType : undefined,
  };
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new UserInputError("Expected a list of ids.");
  }
  return value;
}

function routeId(value: string | string[] | undefined): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new HttpError(400, "Missing id.");
}

function asHttp(error: unknown): unknown {
  if (error instanceof UserInputError) return new HttpError(400, error.message);
  return error;
}
