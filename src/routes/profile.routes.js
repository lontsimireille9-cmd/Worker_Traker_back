import { Router } from 'express';
import { getCompanyProfile, updateCompanyProfile, getUserProfile } from '../controllers/profile.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireCompanyAccess } from '../middleware/company.middleware.js';

const router = Router();

router.get('/me', requireAuth, getUserProfile);
router.get('/company', requireAuth, requireCompanyAccess, getCompanyProfile);
router.patch('/company', requireAuth, requireCompanyAccess, updateCompanyProfile);

export default router;
