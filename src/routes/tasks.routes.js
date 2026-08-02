import { Router } from 'express';
import { createTask, listTasks, updateTaskStatus } from '../controllers/tasks.controller.js';
import { requireAuth, requireManager } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/', requireAuth, requireManager, createTask);
router.get('/', requireAuth, listTasks);
router.patch('/:id/status', requireAuth, updateTaskStatus);

export default router;
