import {
  createTeamService,
  getCompanyTeamsKpisService,
  getTeamKpisService,
  listTeamsService,
  updateTeamLeaderService,
  updateTeamMemberRoleService,
} from '../services/team.service.js';
import { sendSuccess } from '../utils/response.js';

export async function createTeam(req, res, next) {
  try {
    const team = await createTeamService(req.user, req.body);
    return sendSuccess(res, 201, 'Équipe créée', team);
  } catch (error) {
    next(error);
  }
}

export async function listTeams(req, res, next) {
  try {
    const teams = await listTeamsService(req.user);
    return sendSuccess(res, 200, 'Équipes récupérées', teams);
  } catch (error) {
    next(error);
  }
}

export async function teamKpis(req, res, next) {
  try {
    const data = await getTeamKpisService(req.user, req.params.id);
    return sendSuccess(res, 200, 'KPI de l’équipe récupérés', data);
  } catch (error) {
    next(error);
  }
}

export async function companyTeamsKpis(req, res, next) {
  try {
    const data = await getCompanyTeamsKpisService(req.user);
    return sendSuccess(res, 200, 'KPI des équipes récupérés', data);
  } catch (error) {
    next(error);
  }
}

export async function updateTeamMemberRole(req, res, next) {
  try {
    const data = await updateTeamMemberRoleService(
      req.user,
      req.params.id,
      req.params.memberId,
      req.body?.role
    );

    return sendSuccess(res, 200, 'Statut du membre mis à jour', data);
  } catch (error) {
    next(error);
  }
}

export async function updateTeamLeader(req, res, next) {
  try {
    const data = await updateTeamLeaderService(
      req.user,
      req.params.id,
      req.body?.leaderId
    );

    return sendSuccess(res, 200, 'Responsable de l’équipe mis à jour', data);
  } catch (error) {
    next(error);
  }
}
