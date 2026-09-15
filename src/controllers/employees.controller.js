import { createEmployeeService, listEmployeeService } from '../services/employee.service.js';
import { sendSuccess } from '../utils/response.js';

export async function createEmployee(req, res, next) {
  try {
    const employee = await createEmployeeService(req.user, req.body);
    return sendSuccess(res, 201, 'Employé créé', employee);
  } catch (error) {
    next(error);
  }
}

export async function listEmployees(req, res, next) {
  try {
    const employees = await listEmployeeService(req.user);
    return sendSuccess(res, 200, 'Employés récupérés', employees);
  } catch (error) {
    next(error);
  }
}
