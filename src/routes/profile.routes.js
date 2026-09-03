import { Router } from 'express';
import { getCompanyProfile, updateCompanyProfile, getUserProfile } from '../controllers/profile.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/me', requireAuth, getUserProfile);
router.get('/company', requireAuth, getCompanyProfile);
router.patch('/company', requireAuth, updateCompanyProfile);

export default router;
