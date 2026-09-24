import { Router } from 'express';
import { companyAnalytics, projectAnalytics, auditHistory } from '../controllers/analytics.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
const router=Router();
router.get('/',requireAuth,companyAnalytics);
router.get('/audit',requireAuth,auditHistory);
router.get('/projects/:id',requireAuth,projectAnalytics);
export default router;
