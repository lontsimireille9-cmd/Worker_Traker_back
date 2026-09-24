import { createTaskService,listTasksService,updateTaskStatusService,updateTaskDetailsService,updateTaskOrderService,createSubtasksService,listSubtasksService,updateSubtaskService,submitTaskService,validateTaskService } from '../services/task.service.js';
import { sendSuccess } from '../utils/response.js';
const wrap=(fn,msg='OK')=>async(req,res,next)=>{try{return sendSuccess(res,200,msg,await fn(req));}catch(e){next(e)}};
export async function createTask(req,res,next){try{return sendSuccess(res,201,'Tâche créée',await createTaskService(req.user,req.body));}catch(e){next(e)}}
export async function listTasks(req,res,next){try{return sendSuccess(res,200,'Tâches récupérées',await listTasksService(req.user));}catch(e){next(e)}}
export async function updateTaskStatus(req,res,next){try{return sendSuccess(res,200,'Statut mis à jour',await updateTaskStatusService(req.user,req.params.id,req.body.status));}catch(e){next(e)}}
export async function updateTaskDetails(req,res,next){try{return sendSuccess(res,200,'Tâche mise à jour',await updateTaskDetailsService(req.user,req.params.id,req.body));}catch(e){next(e)}}
export async function updateTaskOrder(req,res,next){try{return sendSuccess(res,200,'Ordre mis à jour',await updateTaskOrderService(req.user,req.params.id,req.body.sortOrder));}catch(e){next(e)}}
export async function createSubtasks(req,res,next){try{return sendSuccess(res,201,'Plan de sous-tâches enregistré',await createSubtasksService(req.user,req.params.id,req.body.items));}catch(e){next(e)}}
export async function listSubtasks(req,res,next){try{return sendSuccess(res,200,'Sous-tâches récupérées',await listSubtasksService(req.user,req.params.id));}catch(e){next(e)}}
export async function updateSubtask(req,res,next){try{return sendSuccess(res,200,'Sous-tâche mise à jour',await updateSubtaskService(req.user,req.params.id,req.body));}catch(e){next(e)}}
export async function submitTask(req,res,next){try{return sendSuccess(res,200,'Tâche soumise',await submitTaskService(req.user,req.params.id,req.body));}catch(e){next(e)}}
export async function validateTask(req,res,next){try{return sendSuccess(res,200,'Décision enregistrée',await validateTaskService(req.user,req.params.id,req.body.decision,req.body.note));}catch(e){next(e)}}
