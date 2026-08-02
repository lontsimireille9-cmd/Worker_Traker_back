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

export const createCompanyValidator = [
  body('name').trim().isLength({ min: 2 }).withMessage('name invalide'),
  body('address').optional({ values: 'falsy' }).trim(),
  body('country').optional({ values: 'falsy' }).trim(),
  body('phone').optional({ values: 'falsy' }).trim(),
  body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail().withMessage('email invalide'),
];
