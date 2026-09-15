import { buildActivityReport, createReportPdf, getActivityReport, listActivityReports, saveActivityReport } from '../services/report.service.js';
import { sendSuccess } from '../utils/response.js';

export async function getReportSummary(req, res, next) { try { return sendSuccess(res, 200, 'Statistiques récupérées', await buildActivityReport(req.user, req.query.period)); } catch (error) { next(error); } }
export async function createReport(req, res, next) { try { return sendSuccess(res, 201, 'Rapport enregistré', await saveActivityReport(req.user, req.body?.period)); } catch (error) { next(error); } }
export async function listReports(req, res, next) { try { return sendSuccess(res, 200, 'Rapports récupérés', await listActivityReports(req.user)); } catch (error) { next(error); } }
export async function downloadReport(req, res, next) { try { const report = await getActivityReport(req.params.id); if (req.user.role !== 'SUPER_ADMIN' && report.ownerUid !== req.user.uid && report.companyId !== req.user.companyId) return res.status(403).json({ error: 'Accès refusé' }); const pdf = createReportPdf(report); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="rapport-${report.periodDays}j-${report.createdAt.slice(0, 10)}.pdf"`); return res.send(pdf); } catch (error) { next(error); } }
