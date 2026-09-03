import { Router } from 'express';
import {
  createTask,
  listTasks,
  updateTaskStatus,
  updateTaskDetails,
  updateTaskOrder,
} from '../controllers/tasks.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireCompanyAccess } from '../middleware/company.middleware.js';

const router = Router();

router.post('/', requireAuth, requireCompanyAccess, createTask);
router.get('/', requireAuth, requireCompanyAccess, listTasks);
router.patch('/:id/status', requireAuth, requireCompanyAccess, updateTaskStatus);
router.patch('/:id/order', requireAuth, requireCompanyAccess, updateTaskOrder);
router.patch('/:id', requireAuth, requireCompanyAccess, updateTaskDetails);

export default router;
