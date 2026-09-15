import { Router } from 'express';
import { createReport, downloadReport, getReportSummary, listReports } from '../controllers/reports.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();
router.get('/summary', requireAuth, requireRole(ROLES.SUPER_ADMIN), getReportSummary);
router.get('/', requireAuth, requireRole(ROLES.SUPER_ADMIN), listReports);
router.post('/', requireAuth, requireRole(ROLES.SUPER_ADMIN), createReport);
router.get('/:id/pdf', requireAuth, downloadReport);
export default router;
