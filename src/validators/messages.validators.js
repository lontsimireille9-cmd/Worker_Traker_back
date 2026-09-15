import { body, query, validationResult } from 'express-validator';

export function validateMessageRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, message: 'Données invalides', data: errors.array().map((e) => ({ field: e.path, message: e.msg })) });
  }
  next();
}

export const privateConversationValidator = [body('userId').trim().notEmpty().withMessage('userId requis')];
export const groupValidator = [
  body('name').trim().isLength({ min: 1, max: 80 }).withMessage('Nom de groupe invalide'),
  body('memberIds').optional().isArray({ max: 100 }).withMessage('Liste de membres invalide'),
];
export const messageValidator = [body('content').trim().isLength({ min: 1, max: 4000 }).withMessage('Message invalide')];
export const memberValidator = [body('userId').trim().notEmpty().withMessage('userId requis')];
export const groupNameValidator = [body('name').trim().isLength({ min: 1, max: 80 }).withMessage('Nom de groupe invalide')];
export const searchValidator = [query('q').optional().isString().isLength({ max: 100 }).withMessage('Recherche invalide')];
