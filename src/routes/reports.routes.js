import { Router } from 'express';
import { createReport, downloadReport, getReportSummary, listReports } from '../controllers/reports.controller.js';
import { requireAuth, requireManager } from '../middleware/auth.middleware.js';

const router = Router();
router.get('/summary', requireAuth, getReportSummary);
router.get('/', requireAuth, requireManager, listReports);
router.post('/', requireAuth, requireManager, createReport);
router.get('/:id/pdf', requireAuth, downloadReport);
export default router;
