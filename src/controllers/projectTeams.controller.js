import {
  assignTeamToProject,
  getProjectTeams,
  validateProjectTeamWeights
} from "../services/projectTeams.service.js";

function companyIdFromRequest(req) {
  return (
    req.user?.companyId ||
    req.auth?.companyId ||
    req.body?.companyId
  );
}

export async function addProjectTeam(req, res) {
  try {
    const companyId = companyIdFromRequest(req);

    const result = await assignTeamToProject({
      user: req.user,
      companyId,
      projectId: req.params.projectId,
      teamId: req.body.teamId,
      managerId: req.body.managerId || null,
      weight: Number(req.body.weight)
    });

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(error.status || 400).json({
      success: false,
      message: error.message
    });
  }
}

export async function listProjectTeams(req, res) {
  try {
    const companyId = companyIdFromRequest(req);

    const data = await getProjectTeams(
      companyId,
      req.params.projectId
    );

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(error.status || 400).json({
      success: false,
      message: error.message
    });
  }
}

export async function checkProjectTeamWeights(req, res) {
  try {
    const companyId = companyIdFromRequest(req);

    const result = await validateProjectTeamWeights(
      companyId,
      req.params.projectId
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(error.status || 400).json({
      success: false,
      message: error.message
    });
  }
}
