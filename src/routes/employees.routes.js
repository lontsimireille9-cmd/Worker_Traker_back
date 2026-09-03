import { Router } from 'express';
import { createEmployee, listEmployees } from '../controllers/employees.controller.js';
import { requireAuth, requireManager } from '../middleware/auth.middleware.js';
import { createEmployeeValidator, validateRequest } from '../validators/employee.validators.js';

const router = Router();

router.post('/', requireAuth, requireManager, createEmployeeValidator, validateRequest, createEmployee);
router.get('/', requireAuth, requireManager, listEmployees);

export default router;
