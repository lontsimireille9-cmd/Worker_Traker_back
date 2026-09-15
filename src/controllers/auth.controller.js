import { auth } from '../config/firebase.js';
import { registerProfileService, getMeService, resolveMatriculeService } from '../services/auth.service.js';
import { sendSuccess, sendError } from '../utils/response.js';

export async function registerProfile(req, res, next) {
  try {
    const profile = await registerProfileService(req.body);
    return sendSuccess(res, 201, 'Profil créé', profile);
  } catch (error) {
    next(error);
  }
}

export async function getMe(req, res, next) {
  try {
    const profile = await getMeService(req.user.uid);
    return sendSuccess(res, 200, 'Profil récupéré', profile);
  } catch (error) {
    next(error);
  }
}

export async function resolveMatricule(req, res, next) {
  try {
    const result = await resolveMatriculeService(req.body.matricule);
    return sendSuccess(res, 200, 'Matricule résolu', result);
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();

    if (!email || !password) {
      return sendError(res, 400, 'Email et mot de passe requis');
    }

    const user = await auth.getUserByEmail(email);
    return sendSuccess(res, 200, 'Connexion préparée', { uid: user.uid, email: user.email });
  } catch (error) {
    next(error);
  }
}