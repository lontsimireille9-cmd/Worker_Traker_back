import { Router } from 'express';
import { createProject, listProjects, getProject } from '../controllers/projects.controller.js';
import { requireAuth, requireManager } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/', requireAuth, requireManager, createProject);
router.get('/', requireAuth, listProjects);
router.get('/:id', requireAuth, getProject);

export default router;
