import { Router } from 'express';
import { getCompanyProfile, updateCompanyProfile } from '../controllers/profile.controller.js';
import { requireAuth, requireManager } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/company', requireAuth, getCompanyProfile);
router.patch('/company', requireAuth, requireManager, updateCompanyProfile);

export default router;
