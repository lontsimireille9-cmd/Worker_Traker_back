import { Router } from 'express';
import { createEmployee, listEmployees } from '../controllers/employees.controller.js';
import { requireAuth, requireAdmin, requireManager } from '../middleware/auth.middleware.js';
import { createEmployeeValidator, validateRequest } from '../validators/employee.validators.js';

const router = Router();

router.post('/', requireAuth, requireAdmin, createEmployeeValidator, validateRequest, createEmployee);
router.get('/', requireAuth, requireManager, listEmployees);

export default router;
