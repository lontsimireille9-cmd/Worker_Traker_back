import { Router } from "express";
import { requireAuth, requireManager } from "../middleware/auth.middleware.js";

import {
  createSection,
  listProjectSections,
  listTeamSections,
  checkSectionWeights
} from "../controllers/projectSections.controller.js";

const router = Router();

router.post(
  "/projects/:projectId/sections",
  requireAuth,
  requireManager,
  createSection
);

router.get(
  "/projects/:projectId/sections",
  requireAuth,
  listProjectSections
);

router.get(
  "/projects/:projectId/project-teams/:projectTeamId/sections",
  requireAuth,
  listTeamSections
);

router.get(
  "/projects/:projectId/project-teams/:projectTeamId/sections/validate",
  requireAuth,
  checkSectionWeights
);

export default router;
