import { body, validationResult } from 'express-validator';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Données invalides',
      data: errors.array().map((error) => ({ field: error.path, message: error.msg })),
    });
  }
  next();
};

export const createEmployeeValidator = [
  body('matricule').trim().notEmpty().isLength({ min: 3 }).withMessage('matricule invalide'),
  body('name').trim().isLength({ min: 2 }).withMessage('name invalide'),
  body('code').trim().isLength({ min: 6 }).withMessage('code invalide'),
  body('role').optional({ values: 'falsy' }).trim().toUpperCase().isIn(['EMPLOYEE', 'MANAGER']).withMessage('role invalide'),
  body('department').optional({ values: 'falsy' }).trim(),
  body('position').optional({ values: 'falsy' }).trim(),
  body('companyId').optional({ values: 'falsy' }).trim(),
];
