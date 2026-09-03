import { Router } from 'express';
import { createTeam, listTeams } from '../controllers/teams.controller.js';
import { requireAuth, requireManager } from '../middleware/auth.middleware.js';
import { requireCompanyAccess } from '../middleware/company.middleware.js';

const router = Router();

router.post('/', requireAuth, requireCompanyAccess, requireManager, createTeam);
router.get('/', requireAuth, requireCompanyAccess, listTeams);

export default router;
