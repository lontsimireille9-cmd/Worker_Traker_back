import { Router } from 'express';
import { registerProfile, getMe, resolveMatricule, login } from '../controllers/auth.controller.js';
import { requireAuth, rateLimiter } from '../middleware/auth.middleware.js';
import { registerProfileValidator, resolveMatriculeValidator, validateRequest } from '../validators/auth.validators.js';

const router = Router();

router.use(rateLimiter(15 * 60 * 1000, 20));

router.get('/', (req, res) => {
  res.json({ service: 'Auth API', status: 'running' });
});

router.post('/register-profile', registerProfileValidator, validateRequest, registerProfile);
router.post('/resolve-matricule', resolveMatriculeValidator, validateRequest, resolveMatricule);
router.post('/login', login);
router.get('/me', requireAuth, getMe);

export default router;