import { createTeamService, listTeamsService } from '../services/team.service.js';
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
