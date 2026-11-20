import { Router } from "express";
import type { AppDatabase } from "@warmysender/core";
import { HttpError } from "../http.js";
import { requireUser } from "../middleware.js";
import { createDrizzleContactStore } from "./db.js";
import { isSuppressed } from "./suppression.js";
import {
  addSuppression,
  createList,
  deleteList,
  importCsv,
  previewImport,
  removeSuppression,
  setContactLists,
  setContactStatus,
  UserInputError,
} from "./service.js";
import type { ColumnMapping, ContactStore, SuppressionKind } from "./types.js";

export function contactsRouter(db: AppDatabase): Router {
  const router = Router();
  router.use(requireUser);
  const store = createDrizzleContactStore(db);
  const clock = { id: () => crypto.randomUUID() };

  router.get("/", async (_req, res, next) => {
    try {
      res.json(await presentContacts(store));
    } catch (error) {
      next(error);
    }
  });

  router.post("/import/preview", async (req, res, next) => {
    try {
      const csv = readCsv(req.body?.csv);
      const preview = await previewImport(csv, readBoolean(req.body?.hasHeader, true));
      res.json(preview);
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.post("/import", async (req, res, next) => {
    try {
      const report = await importCsv(store, clock, {
        csv: readCsv(req.body?.csv),
        hasHeader: readBoolean(req.body?.hasHeader, true),
        mapping: readMapping(req.body?.mapping),
        listIds: readStringArray(req.body?.listIds),
      });
      res.status(201).json(report);
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.post("/lists", async (req, res, next) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name : "";
      const list = await createList(store, clock, name);
      res.status(201).json({ list });
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.delete("/lists/:id", async (req, res, next) => {
    try {
      await deleteList(store, routeId(req.params.id));
      res.status(204).end();
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.post("/suppressions", async (req, res, next) => {
    try {
      const kind = readKind(req.body?.kind);
      const value = typeof req.body?.value === "string" ? req.body.value : "";
      const suppression = await addSuppression(store, clock, kind, value);
      res.status(201).json({ suppression });
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.delete("/suppressions/:id", async (req, res, next) => {
    try {
      await removeSuppression(store, routeId(req.params.id));
      res.status(204).end();
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const status = typeof req.body?.status === "string" ? req.body.status : "";
      const contact = await setContactStatus(store, clock, routeId(req.params.id), status);
      res.json({ contact });
    } catch (error) {
      next(asHttp(error));
    }
  });

  router.put("/:id/lists", async (req, res, next) => {
    try {
      await setContactLists(store, routeId(req.params.id), readStringArray(req.body?.listIds));
      res.status(204).end();
    } catch (error) {
      next(asHttp(error));
    }
  });

  return router;
}

async function presentContacts(store: ContactStore) {
  const [contacts, lists, memberships, suppressions] = await Promise.all([
    store.listContacts(),
    store.listLists(),
    store.listMemberships(),
    store.listSuppressions(),
  ]);
  const listsByContact = new Map<string, string[]>();
  for (const membership of memberships) {
    const current = listsByContact.get(membership.contactId) ?? [];
    current.push(membership.listId);
    listsByContact.set(membership.contactId, current);
  }
  return {
    contacts: contacts.map((contact) => ({
      ...contact,
      listIds: listsByContact.get(contact.id) ?? [],
      suppressed: isSuppressed(contact.email, suppressions),
    })),
    lists,
    suppressions,
  };
}

function readCsv(value: unknown): string {
  if (typeof value !== "string") throw new UserInputError("Paste or upload a CSV.");
  return value;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new UserInputError("Expected a list of ids.");
  }
  return value;
}

function readMapping(value: unknown): ColumnMapping {
  if (!Array.isArray(value)) throw new UserInputError("Map the CSV columns before importing.");
  return value.map((item) => {
    if (typeof item !== "object" || item === null) throw new UserInputError("Column mapping is invalid.");
    const record = item as { index?: unknown; field?: unknown };
    if (typeof record.index !== "number" || typeof record.field !== "string") {
      throw new UserInputError("Column mapping is invalid.");
    }
    return { index: record.index, field: record.field as ColumnMapping[number]["field"] };
  });
}

function readKind(value: unknown): SuppressionKind {
  if (value === "email" || value === "domain") return value;
  throw new UserInputError("Suppression must be an email or a domain.");
}

function routeId(value: string | string[] | undefined): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new HttpError(400, "Missing id.");
}

function asHttp(error: unknown): unknown {
  if (error instanceof UserInputError) return new HttpError(400, error.message);
  return error;
}
