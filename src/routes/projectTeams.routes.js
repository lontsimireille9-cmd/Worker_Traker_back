import { Router } from "express";
import {
  addProjectTeam,
  listProjectTeams,
  checkProjectTeamWeights
} from "../controllers/projectTeams.controller.js";
import {
  requireAuth,
  requireManager,
} from "../middleware/auth.middleware.js";

const router = Router();

router.post(
  "/projects/:projectId/teams",
  requireAuth,
  requireManager,
  addProjectTeam
);

router.get(
  "/projects/:projectId/teams",
  requireAuth,
  listProjectTeams
);

router.get(
  "/projects/:projectId/teams/validate",
  requireAuth,
  requireManager,
  checkProjectTeamWeights
);

export default router;
