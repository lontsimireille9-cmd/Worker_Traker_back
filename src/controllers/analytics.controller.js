import { getCompanyAnalytics, getProjectAnalytics } from '../services/kpi.service.js';
import { listAudit } from '../services/audit.service.js';
import { sendSuccess } from '../utils/response.js';
export async function companyAnalytics(req,res,next){try{return sendSuccess(res,200,'KPI récupérés',await getCompanyAnalytics(req.user));}catch(e){next(e)}}
export async function projectAnalytics(req,res,next){try{return sendSuccess(res,200,'KPI du projet récupérés',await getProjectAnalytics(req.user,req.params.id));}catch(e){next(e)}}
export async function auditHistory(req,res,next){try{return sendSuccess(res,200,'Historique récupéré',await listAudit(req.user,req.query));}catch(e){next(e)}}
