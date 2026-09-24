import { Router } from "express";
import { requireAuth, requireManager } from "../middleware/auth.middleware.js";

import {
  createTaskForSection,
  listSectionTasks
} from "../controllers/projectSectionTasks.controller.js";

const router = Router();

router.post(
  "/projects/:projectId/sections/:sectionId/tasks",
  requireAuth,
  requireManager,
  createTaskForSection
);

router.get(
  "/projects/:projectId/sections/:sectionId/tasks",
  requireAuth,
  listSectionTasks
);

export default router;
