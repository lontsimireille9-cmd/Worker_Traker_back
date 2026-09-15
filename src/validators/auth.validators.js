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

export const registerProfileValidator = [
  body('uid').trim().notEmpty().withMessage('uid requis'),
  body('email').trim().isEmail().normalizeEmail().withMessage('email invalide'),
  body('nom').optional({ values: 'falsy' }).trim().isLength({ min: 2 }).withMessage('nom invalide'),
  body('prenom').optional({ values: 'falsy' }).trim().isLength({ min: 2 }).withMessage('prenom invalide'),
  body('telephone').optional({ values: 'falsy' }).trim().isLength({ min: 8 }).withMessage('telephone invalide'),
  body('role').trim().toUpperCase().isIn(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE']).withMessage('role invalide'),
  body('companyId').optional({ values: 'falsy' }).trim(),
];

export const resolveMatriculeValidator = [
  body('matricule').trim().notEmpty().withMessage('matricule requis'),
];
