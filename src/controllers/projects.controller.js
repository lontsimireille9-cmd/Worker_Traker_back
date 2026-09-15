import { createProjectService, listProjectsService, getProjectService } from '../services/project.service.js';
import { sendSuccess } from '../utils/response.js';

export async function createProject(req, res, next) {
  try {
    const project = await createProjectService(req.user, req.body);
    return sendSuccess(res, 201, 'Projet créé', project);
  } catch (error) {
    next(error);
  }
}

export async function listProjects(req, res, next) {
  try {
    const projects = await listProjectsService(req.user);
    return sendSuccess(res, 200, 'Projets récupérés', projects);
  } catch (error) {
    next(error);
  }
}

export async function getProject(req, res, next) {
  try {
    const project = await getProjectService(req.user, req.params.id);
    return sendSuccess(res, 200, 'Projet récupéré', project);
  } catch (error) {
    next(error);
  }
}
