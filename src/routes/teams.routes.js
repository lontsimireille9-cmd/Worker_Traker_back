import { Router } from 'express';
import { createTeam, listTeams } from '../controllers/teams.controller.js';
import { requireAuth, requireManager } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/', requireAuth, requireManager, createTeam);
router.get('/', requireAuth, listTeams);

export default router;
