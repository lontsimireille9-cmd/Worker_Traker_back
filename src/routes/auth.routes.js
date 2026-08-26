import { Router } from "express";

import {
  register,
  me,
} from "../controllers/auth.controller.js";

import {
  requireFirebaseAuth,
  requireAuth,
} from "../middleware/auth.middleware.js";

const router = Router();

/**
 * Inscription Daily Life.
 *
 * Firebase Authentication a déjà créé le compte,
 * mais le profil Firestore users/{uid} n'existe pas encore.
 */
router.post(
  "/register",
  requireFirebaseAuth,
  register
);

/**
 * Utilisateur déjà enregistré.
 */
router.get(
  "/me",
  requireAuth,
  me
);

export default router;