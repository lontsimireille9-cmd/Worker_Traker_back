import { Router } from 'express';
import { clockIn, clockOut, myAttendance, teamAttendance } from '../controllers/attendance.controller.js';
import { requireAuth, requireManager } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/clock-in', requireAuth, clockIn);
router.post('/clock-out', requireAuth, clockOut);
router.get('/me', requireAuth, myAttendance);
router.get('/team', requireAuth, requireManager, teamAttendance);

export default router;
