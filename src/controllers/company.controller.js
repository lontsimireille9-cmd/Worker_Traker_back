import { createCompanyService, getCompanyByIdService, listCompanyEmployeesService } from '../services/company.service.js';
import { sendSuccess } from '../utils/response.js';

export async function createCompany(req, res, next) {
  try {
    const company = await createCompanyService(req.user, req.body);
    return sendSuccess(res, 201, 'Entreprise créée', company);
  } catch (error) {
    next(error);
  }
}

export async function getCompany(req, res, next) {
  try {
    const company = await getCompanyByIdService(req.params.id);
    return sendSuccess(res, 200, 'Entreprise récupérée', company);
  } catch (error) {
    next(error);
  }
}

export async function listCompanyEmployees(req, res, next) {
  try {
    const employees = await listCompanyEmployeesService(req.user.companyId);
    return sendSuccess(res, 200, 'Employés récupérés', employees);
  } catch (error) {
    next(error);
  }
}
