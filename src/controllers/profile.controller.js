import { updateCompanyProfileService, getCompanyProfileService } from '../services/profile.service.js';
import { sendSuccess } from '../utils/response.js';

export async function getUserProfile(req, res, next) {
  try {
    return sendSuccess(res, 200, 'Profil utilisateur récupéré', req.user);
  } catch (error) {
    next(error);
  }
}

export async function getCompanyProfile(req, res, next) {
  try {
    const profile = await getCompanyProfileService({ ...req.user, companyId: req.companyId || req.user.companyId });
    return sendSuccess(res, 200, 'Profil entreprise récupéré', profile);
  } catch (error) {
    next(error);
  }
}

export async function updateCompanyProfile(req, res, next) {
  try {
    const profile = await updateCompanyProfileService({ ...req.user, companyId: req.companyId || req.user.companyId }, req.body);
    return sendSuccess(res, 200, 'Profil entreprise mis à jour', profile);
  } catch (error) {
    next(error);
  }
}
