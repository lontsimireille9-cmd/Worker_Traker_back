import {
  createSectionTask,
  getSectionTasks
} from "../services/projectSectionTasks.service.js";

function companyIdFromRequest(req) {
  return (
    req.user?.companyId ||
    req.auth?.companyId ||
    req.body?.companyId
  );
}

export async function createTaskForSection(req, res) {
  try {
    const companyId = companyIdFromRequest(req);

    const result = await createSectionTask({
      companyId,
      projectId: req.params.projectId,
      sectionId: req.params.sectionId,

      title: req.body.title,
      description: req.body.description || "",

      assigneeId: req.body.assigneeId,
      assignedBy:
        req.user?.uid ||
        req.user?.id ||
        req.auth?.uid,

      estimatedPoints: Number(req.body.estimatedPoints || 0),

      deadline: req.body.deadline || null,

      priority: req.body.priority || "MEDIUM"
    });

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}

export async function listSectionTasks(req, res) {
  try {
    const companyId = companyIdFromRequest(req);

    const data = await getSectionTasks(
      req.user,
      companyId,
      req.params.projectId,
      req.params.sectionId
    );

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}
