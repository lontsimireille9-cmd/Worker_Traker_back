import { Router } from 'express';
import {
  createTask,
  listTasks,
  updateTaskStatus,
  updateTaskDetails,
  updateTaskOrder,
} from '../controllers/tasks.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/', requireAuth, createTask);
router.get('/', requireAuth, listTasks);
router.patch('/:id/status', requireAuth, updateTaskStatus);
router.patch('/:id/order', requireAuth, updateTaskOrder);
router.patch('/:id', requireAuth, updateTaskDetails);

export default router;
