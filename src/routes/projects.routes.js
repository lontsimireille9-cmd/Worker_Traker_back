import { Router } from "express";

import {
  createProject,
  listProjects,
  getProject,
  addProjectTeam,
  addProjectSection,
  saveProjectStructure,
  updateProjectStatus,
  updateProjectScope,
  listProjectVersions,
} from "../controllers/projects.controller.js";

import {
  requireAuth,
  requireManager,
} from "../middleware/auth.middleware.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  listProjects
);

router.post(
  "/",
  requireAuth,
  requireManager,
  createProject
);

router.get(
  "/:id",
  requireAuth,
  getProject
);

router.get(
  "/:id/versions",
  requireAuth,
  listProjectVersions
);

router.post(
  "/:id/teams",
  requireAuth,
  requireManager,
  addProjectTeam
);

router.post(
  "/:id/sections",
  requireAuth,
  requireManager,
  addProjectSection
);

router.put(
  "/:id/structure",
  requireAuth,
  requireManager,
  saveProjectStructure
);

router.patch(
  "/:id/status",
  requireAuth,
  requireManager,
  updateProjectStatus
);

router.patch(
  "/:id/scope",
  requireAuth,
  requireManager,
  updateProjectScope
);

export default router;