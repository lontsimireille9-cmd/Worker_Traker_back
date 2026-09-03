import { Router } from 'express';
import { createEmployee, listEmployees } from '../controllers/employees.controller.js';
import { requireAuth, requireManager } from '../middleware/auth.middleware.js';
import { createEmployeeValidator, validateRequest } from '../validators/employee.validators.js';
import { requireCompanyAccess } from '../middleware/company.middleware.js';

const router = Router();

router.post('/', requireAuth, requireCompanyAccess, requireManager, createEmployeeValidator, validateRequest, createEmployee);
router.get('/', requireAuth, requireCompanyAccess, requireManager, listEmployees);

export default router;
