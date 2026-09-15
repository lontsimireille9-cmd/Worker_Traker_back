import { clockInService, clockOutService, myAttendanceService, teamAttendanceService } from '../services/attendance.service.js';
import { sendSuccess } from '../utils/response.js';

export async function clockIn(req, res, next) {
  try {
    const result = await clockInService(req.user, req.body.location);
    return sendSuccess(res, 200, 'Arrivée enregistrée', result);
  } catch (error) {
    next(error);
  }
}

export async function clockOut(req, res, next) {
  try {
    await clockOutService(req.user);
    return sendSuccess(res, 200, 'Départ enregistré');
  } catch (error) {
    next(error);
  }
}

export async function myAttendance(req, res, next) {
  try {
    const attendance = await myAttendanceService(req.user);
    return sendSuccess(res, 200, 'Historique récupéré', attendance);
  } catch (error) {
    next(error);
  }
}

export async function teamAttendance(req, res, next) {
  try {
    const attendance = await teamAttendanceService(req.user, req.query.date);
    return sendSuccess(res, 200, 'Présence récupérée', attendance);
  } catch (error) {
    next(error);
  }
}
