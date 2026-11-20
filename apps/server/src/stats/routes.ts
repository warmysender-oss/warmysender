import { Router } from "express";
import type { AppDatabase } from "@warmysender/core";
import { requireUser } from "../middleware.js";
import { loadSetup, loadStatsOverview } from "./queries.js";

export function statsRouter(db: AppDatabase): Router {
  const router = Router();
  router.use(requireUser);
  router.get("/", async (_req, res, next) => {
    try {
      res.json(await loadStatsOverview(db));
    } catch (error) {
      next(error);
    }
  });
  return router;
}

export function setupRouter(db: AppDatabase): Router {
  const router = Router();
  router.use(requireUser);
  router.get("/", async (_req, res, next) => {
    try {
      res.json(await loadSetup(db));
    } catch (error) {
      next(error);
    }
  });
  return router;
}
