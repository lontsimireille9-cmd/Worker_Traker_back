import { Router } from 'express';
import { createProject, listProjects, getProject } from '../controllers/projects.controller.js';
import { requireAuth, requireManager } from '../middleware/auth.middleware.js';
import { requireCompanyAccess } from '../middleware/company.middleware.js';

const router = Router();

router.post('/', requireAuth, requireCompanyAccess, requireManager, createProject);
router.get('/', requireAuth, requireCompanyAccess, listProjects);
router.get('/:id', requireAuth, requireCompanyAccess, getProject);

export default router;
