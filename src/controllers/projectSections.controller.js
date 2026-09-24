import {
  createProjectSection,
  getProjectSections,
  getTeamProjectSections,
  validateSectionWeights
} from "../services/projectSections.service.js";

function companyIdFromRequest(req) {
  return (
    req.user?.companyId ||
    req.auth?.companyId ||
    req.body?.companyId
  );
}

export async function createSection(req, res) {
  try {
    const companyId = companyIdFromRequest(req);

    const result = await createProjectSection({
      user: req.user,
      companyId,
      projectId: req.params.projectId,
      projectTeamId: req.body.projectTeamId,
      name: req.body.name,
      description: req.body.description || "",
      weight: Number(req.body.weight),
      assigneeId: req.body.assigneeId || null
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

export async function listProjectSections(req, res) {
  try {
    const companyId = companyIdFromRequest(req);

    const data = await getProjectSections(
      req.user,
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

export async function listTeamSections(req, res) {
  try {
    const companyId = companyIdFromRequest(req);

    const data = await getTeamProjectSections(
      req.user,
      companyId,
      req.params.projectId,
      req.params.projectTeamId
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

export async function checkSectionWeights(req, res) {
  try {
    const companyId = companyIdFromRequest(req);

    const result = await validateSectionWeights(
      req.user,
      companyId,
      req.params.projectId,
      req.params.projectTeamId
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
