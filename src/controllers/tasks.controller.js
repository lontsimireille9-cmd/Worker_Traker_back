import { createTaskService, listTasksService, updateTaskStatusService } from '../services/task.service.js';
import { sendSuccess } from '../utils/response.js';

export async function createTask(req, res, next) {
  try {
    const task = await createTaskService(req.user, req.body);
    return sendSuccess(res, 201, 'Tâche créée', task);
  } catch (error) {
    next(error);
  }
}

export async function listTasks(req, res, next) {
  try {
    const tasks = await listTasksService(req.user);
    return sendSuccess(res, 200, 'Tâches récupérées', tasks);
  } catch (error) {
    next(error);
  }
}

export async function updateTaskStatus(req, res, next) {
  try {
    const result = await updateTaskStatusService(req.user, req.params.id, req.body.status);
    return sendSuccess(res, 200, 'Statut mis à jour', result);
  } catch (error) {
    next(error);
  }
}
