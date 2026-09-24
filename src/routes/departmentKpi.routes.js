import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getBusinessKpis, listDepartmentMetrics, createDepartmentMetric } from '../controllers/departmentKpi.controller.js';
const router = Router();
router.get('/', requireAuth, getBusinessKpis);
router.get('/entries', requireAuth, listDepartmentMetrics);
router.post('/entries', requireAuth, createDepartmentMetric);
export default router;
