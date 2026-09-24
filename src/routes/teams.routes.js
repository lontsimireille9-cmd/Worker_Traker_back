import { Router } from 'express';
import {
  companyTeamsKpis,
  createTeam,
  listTeams,
  teamKpis,
  updateTeamLeader,
  updateTeamMemberRole,
} from '../controllers/teams.controller.js';
import { requireAuth, requireRole, requireManager } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/', requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), createTeam);

// Dashboard KPI de l’ensemble des équipes de l’entreprise.
// Cette route doit être déclarée AVANT /:id/kpis.
router.get('/kpis', requireAuth, companyTeamsKpis);

router.get('/', requireAuth, listTeams);

// Le SUPER_ADMIN peut changer le responsable d'une équipe.
// Le nouveau responsable devient automatiquement MANAGER.
router.patch(
  '/:id/leader',
  requireAuth,
  requireRole('SUPER_ADMIN'),
  updateTeamLeader
);

// Le SUPER_ADMIN peut faire passer un membre EMPLOYEE <-> MANAGER.
router.patch(
  '/:id/members/:memberId/role',
  requireAuth,
  requireRole('SUPER_ADMIN'),
  updateTeamMemberRole
);

router.get('/:id/kpis', requireAuth, teamKpis);

export default router;
