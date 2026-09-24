import { createDepartmentMetricService, getBusinessKpisService, listDepartmentMetricsService } from '../services/departmentKpi.service.js';
import { sendSuccess } from '../utils/response.js';

export async function getBusinessKpis(req, res, next) { try { return sendSuccess(res, 200, 'KPI métier récupérés', await getBusinessKpisService(req.user)); } catch (e) { next(e); } }
export async function listDepartmentMetrics(req, res, next) { try { return sendSuccess(res, 200, 'Entrées métier récupérées', await listDepartmentMetricsService(req.user, req.query)); } catch (e) { next(e); } }
export async function createDepartmentMetric(req, res, next) { try { return sendSuccess(res, 201, 'Entrée métier enregistrée', await createDepartmentMetricService(req.user, req.body)); } catch (e) { next(e); } }
