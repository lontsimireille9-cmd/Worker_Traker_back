import { Router } from 'express';
import { createCompany, getCompany, listCompanyEmployees } from '../controllers/company.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import { createCompanyValidator, validateRequest } from '../validators/company.validators.js';

const router = Router();

router.post('/', requireAuth, requireAdmin, createCompanyValidator, validateRequest, createCompany);
router.get('/:id', requireAuth, requireAdmin, getCompany);
router.get('/:id/employees', requireAuth, requireAdmin, listCompanyEmployees);

export default router;
