import { Router } from 'express';
import { clockIn, clockOut, myAttendance, teamAttendance } from '../controllers/attendance.controller.js';
import { requireAuth, requireManager } from '../middleware/auth.middleware.js';
import { requireCompanyAccess } from '../middleware/company.middleware.js';

const router = Router();

router.post('/clock-in', requireAuth, requireCompanyAccess, clockIn);
router.post('/clock-out', requireAuth, requireCompanyAccess, clockOut);
router.get('/me', requireAuth, requireCompanyAccess, myAttendance);
router.get('/team', requireAuth, requireCompanyAccess, requireManager, teamAttendance);

export default router;
