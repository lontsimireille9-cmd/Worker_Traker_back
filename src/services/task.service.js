import { db } from '../config/firebase.js';
import { audit } from './audit.service.js';
import { normalizeDepartment } from '../constants/departments.js';
import { getMetricDefinitions } from './departmentKpi.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const managerRoles = new Set(['SUPER_ADMIN', 'ADMIN', 'MANAGER']);
const allowedStatuses = ['TODO', 'IN_PROGRESS', 'SUBMITTED', 'IN_VALIDATION', 'VALIDATED', 'COMPLETED', 'REJECTED', 'CORRECTION', 'CANCELLED', 'BLOCKED'];
const now = () => new Date().toISOString();
const clean = v => String(v ?? '').trim();

async function getTask(user, taskId) {
  const snap = await db.collection('tasks').doc(taskId).get();
  if (!snap.exists || snap.data().companyId !== user.companyId) throw fail('Tâche introuvable ou accès refusé', 404);
  return { id: snap.id, ...snap.data() };
}

async function getSectionContext(user, projectId, sectionId) {
  const sectionSnap = await db.collection('projectSections').doc(String(sectionId)).get();
  if (!sectionSnap.exists || sectionSnap.data().companyId !== user.companyId || String(sectionSnap.data().projectId) !== String(projectId)) {
    throw fail('Section introuvable ou accès refusé', 404);
  }

  const section = { id: sectionSnap.id, ...sectionSnap.data() };
  const projectSnap = await db.collection('projects').doc(String(projectId)).get();
  if (!projectSnap.exists || projectSnap.data().companyId !== user.companyId) {
    throw fail('Projet introuvable ou accès refusé', 404);
  }

  if (projectSnap.data().approvalStatus !== 'APPROVED') {
    throw fail('Le projet doit être validé avant de créer des tâches', 409);
  }

  const relationSnap = await db.collection('projectTeams').doc(String(section.projectTeamId)).get();
  if (!relationSnap.exists || relationSnap.data().companyId !== user.companyId || String(relationSnap.data().projectId) !== String(projectId)) {
    throw fail('Équipe du projet introuvable', 404);
  }

  const relation = { id: relationSnap.id, ...relationSnap.data() };
  const teamSnap = await db.collection('teams').doc(String(relation.teamId)).get();
  if (!teamSnap.exists || teamSnap.data().companyId !== user.companyId) {
    throw fail('Équipe introuvable', 404);
  }

  const team = { id: teamSnap.id, ...teamSnap.data() };
  const memberIds = [
    ...(Array.isArray(team.memberIds) ? team.memberIds : []),
    team.leaderId,
  ].map(String).filter(Boolean);

  const isTeamManager = ['SUPER_ADMIN', 'ADMIN'].includes(user.role) ||
    (user.role === 'MANAGER' && String(relation.managerId || team.leaderId || '') === String(user.uid));

  const isSectionAssignee = String(section.assigneeId || '') === String(user.uid);

  if (!isTeamManager && !isSectionAssignee) {
    throw fail('Vous ne pouvez créer des tâches que dans votre section autorisée', 403);
  }

  return { project: { id: projectSnap.id, ...projectSnap.data() }, section, relation, team, memberIds };
}

async function assertTaskManagerAccess(user, task) {
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return;

  if (user.role !== 'MANAGER') {
    throw fail('Accès refusé', 403);
  }

  const teamId = String(task.teamId || '');
  if (!teamId) throw fail('Cette tâche n’est pas rattachée à une équipe', 403);

  const teamSnap = await db.collection('teams').doc(teamId).get();
  if (!teamSnap.exists || teamSnap.data().companyId !== user.companyId ||
      String(teamSnap.data().leaderId || '') !== String(user.uid)) {
    throw fail('Vous ne gérez pas l’équipe de cette tâche', 403);
  }
}

export async function createTaskService(user, payload) {
  const title = clean(payload.title);
  if (!title) throw fail('Titre requis');
  if (!user.companyId) throw fail('Entreprise requise');

  const projectId = clean(payload.projectId);
  const sectionId = clean(payload.sectionId);
  if (!projectId) throw fail('Projet requis');
  if (!sectionId) throw fail('Section requise');

  const context = await getSectionContext(user, projectId, sectionId);
  const manager = managerRoles.has(user.role);

  let assigneeId = clean(payload.assigneeId);
  if (!manager) {
    // Un membre ne peut créer une tâche que pour lui-même dans sa section.
    assigneeId = user.uid;
  } else if (!assigneeId) {
    assigneeId = context.section.assigneeId || user.uid;
  }

  if (!assigneeId) throw fail('Responsable requis');

  if (!context.memberIds.includes(String(assigneeId))) {
    throw fail('Le responsable de la tâche doit appartenir à l’équipe de la section', 400);
  }

  const assignee = await db.collection('users').doc(assigneeId).get();
  if (!assignee.exists || assignee.data().companyId !== user.companyId) {
    throw fail('Responsable introuvable', 404);
  }

  const timestamp = now();
  const assigneeData = assignee.data();
  const department = normalizeDepartment(assigneeData.department);
  const activityType = clean(payload.activityType);
  const metricDefinition = getMetricDefinitions(department).find(definition => definition.key === activityType);
  if (activityType && !metricDefinition) {
    throw fail('Indicateur métier invalide pour le département du responsable');
  }

  const data = {
    companyId: user.companyId,
    projectId,
    projectTeamId: context.relation.id,
    teamId: context.team.id,
    sectionId,
    title,
    description: clean(payload.description),
    assigneeId,
    createdBy: user.uid,
    assignedBy: manager ? user.uid : null,
    priority: clean(payload.priority || 'MEDIUM').toUpperCase(),
    deadline: payload.deadline || null,
    estimatePoints: Number(payload.estimatePoints) || 1,
    weight: Number(payload.weight) || 1,
    department,
    activityType,
    activityUnit: metricDefinition?.unit || clean(payload.activityUnit),
    plannedValue: Math.max(Number(payload.plannedValue) || 0, 0),
    status: 'TODO',
    blocked: false,
    rejectionCount: 0,
    sortOrder: Date.now(),
    createdAt: timestamp,
    updatedAt: timestamp,
    validatedAt: null,
  };

  const ref = await db.collection('tasks').add(data);
  await audit(user, 'TASK_CREATED', 'task', ref.id, {
    projectId,
    sectionId,
    teamId: context.team.id,
    assigneeId,
    department,
    activityType: data.activityType || null,
    estimatePoints: data.estimatePoints,
  });

  return {
    id: ref.id,
    ...data,
    projectName: context.project.name || context.project.title || 'Projet',
    sectionName: context.section.name || 'Section',
    teamName: context.team.name || 'Équipe',
    assigneeName: assigneeData.name || assigneeData.displayName || assigneeData.fullName || assigneeData.email || 'Employé',
  };
}

async function enrichTaskDisplayData(tasks, companyId) {
  const projectIds = [...new Set(tasks.map(t => String(t.projectId || '')).filter(Boolean))];
  const sectionIds = [...new Set(tasks.map(t => String(t.sectionId || '')).filter(Boolean))];
  const teamIds = [...new Set(tasks.map(t => String(t.teamId || '')).filter(Boolean))];
  const assigneeIds = [...new Set(tasks.map(t => String(t.assigneeId || '')).filter(Boolean))];

  const [projectDocs, sectionDocs, teamDocs, assigneeDocs] = await Promise.all([
    Promise.all(projectIds.map(id => db.collection('projects').doc(id).get())),
    Promise.all(sectionIds.map(id => db.collection('projectSections').doc(id).get())),
    Promise.all(teamIds.map(id => db.collection('teams').doc(id).get())),
    Promise.all(assigneeIds.map(id => db.collection('users').doc(id).get())),
  ]);

  const projectNames = new Map();
  projectDocs.forEach(doc => {
    if (doc.exists && doc.data().companyId === companyId) projectNames.set(doc.id, doc.data().name || doc.data().title || 'Projet');
  });

  const sectionNames = new Map();
  sectionDocs.forEach(doc => {
    if (doc.exists && doc.data().companyId === companyId) sectionNames.set(doc.id, doc.data().name || 'Section');
  });

  const teamNames = new Map();
  teamDocs.forEach(doc => {
    if (doc.exists && doc.data().companyId === companyId) teamNames.set(doc.id, doc.data().name || 'Équipe');
  });

  const assigneeNames = new Map();
  assigneeDocs.forEach(doc => {
    if (doc.exists && doc.data().companyId === companyId) {
      const data = doc.data();
      assigneeNames.set(doc.id, data.name || data.displayName || data.fullName || data.email || 'Employé');
    }
  });

  return tasks.map(task => ({
    ...task,
    projectName: task.projectName || projectNames.get(String(task.projectId || '')) || 'Sans projet',
    sectionName: task.sectionName || sectionNames.get(String(task.sectionId || '')) || 'Sans section',
    teamName: task.teamName || teamNames.get(String(task.teamId || '')) || 'Sans équipe',
    assigneeName: task.assigneeName || assigneeNames.get(String(task.assigneeId || '')) || 'Non assignée',
  }));
}

export async function listTasksService(user) {
  if (!user.companyId) return [];

  const snap = await db.collection('tasks').where('companyId', '==', user.companyId).get();
  let tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (user.role === 'EMPLOYEE') {
    tasks = tasks.filter(t => String(t.assigneeId || '') === String(user.uid));
  } else if (user.role === 'MANAGER') {
    const teamsSnap = await db.collection('teams')
      .where('companyId', '==', user.companyId)
      .where('leaderId', '==', user.uid)
      .get();
    const managedTeamIds = new Set(teamsSnap.docs.map(d => String(d.id)));
    tasks = tasks.filter((task) =>
      managedTeamIds.has(String(task.teamId || '')) ||
      String(task.assigneeId || '') === String(user.uid)
    );
  }

  tasks = await enrichTaskDisplayData(tasks, user.companyId);

  return tasks.sort((a, b) =>
    new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
  );
}

export async function updateTaskStatusService(user, taskId, status) {
  const task = await getTask(user, taskId);
  if (!allowedStatuses.includes(status)) throw fail('Statut invalide');
  const manager = managerRoles.has(user.role);
  if (manager) {
    await assertTaskManagerAccess(user, task);
  } else if (task.assigneeId !== user.uid) {
    throw fail('Vous ne pouvez modifier que vos tâches', 403);
  }
  if (status === 'VALIDATED' && !manager) throw fail('Seul un responsable peut valider définitivement une tâche', 403);
  if (status === 'COMPLETED' && !['TODO', 'IN_PROGRESS', 'CORRECTION', 'SUBMITTED', 'IN_VALIDATION'].includes(task.status)) {
    throw fail('Cette tâche ne peut plus être marquée comme réalisée depuis son état actuel', 409);
  }
  if (status === 'COMPLETED' && !manager && String(task.assigneeId || '') !== String(user.uid)) {
    throw fail('Vous ne pouvez terminer que vos propres tâches', 403);
  }
  if (status === 'IN_VALIDATION' && !['SUBMITTED', 'CORRECTION', 'IN_PROGRESS'].includes(task.status)) throw fail('La tâche doit être soumise avant validation');
  const completionNow = now();
  const patch = {
    status,
    updatedAt: completionNow,
    ...(status === 'VALIDATED' ? { validatedAt: completionNow, completedAt: completionNow, blocked: false } : {}),
    ...(status === 'COMPLETED' ? { completedAt: completionNow, blocked: false } : {}),
    ...(status === 'SUBMITTED' ? { submittedAt: completionNow } : {})
  };
  await db.collection('tasks').doc(taskId).update(patch);
  await audit(user, 'TASK_STATUS_CHANGED', 'task', taskId, { from: task.status, to: status });
  return { ...task, ...patch };
}

export async function updateTaskDetailsService(user, taskId, payload) {
  const task = await getTask(user, taskId);
  const manager = managerRoles.has(user.role);
  if (manager) {
    await assertTaskManagerAccess(user, task);
  } else if (task.assigneeId !== user.uid) {
    throw fail('Accès refusé', 403);
  }

  const patch = {};
  for (const key of ['title', 'description', 'priority', 'deadline', 'estimatePoints', 'blocked']) {
    if (key in payload) patch[key] = payload[key];
  }

  if (manager && 'assigneeId' in payload) {
    const assigneeId = clean(payload.assigneeId);
    if (!assigneeId) throw fail('Responsable requis');
    const assigneeSnap = await db.collection('users').doc(assigneeId).get();
    if (!assigneeSnap.exists || assigneeSnap.data().companyId !== user.companyId) throw fail('Responsable introuvable', 404);

    const teamId = String(task.teamId || '');
    const teamSnap = teamId ? await db.collection('teams').doc(teamId).get() : null;
    const team = teamSnap?.exists ? teamSnap.data() : {};
    const memberIds = new Set([...(Array.isArray(team.memberIds) ? team.memberIds : []), team.leaderId].filter(Boolean).map(String));
    if (!memberIds.has(assigneeId)) throw fail('Le responsable doit appartenir à l’équipe de la tâche', 400);

    patch.assigneeId = assigneeId;
    patch.department = normalizeDepartment(assigneeSnap.data().department);
  }

  const effectiveDepartment = patch.department || normalizeDepartment(task.department);
  if (patch.department && !('activityType' in payload)) {
    const currentActivityType = clean(task.activityType);
    const currentDefinition = getMetricDefinitions(effectiveDepartment).find(item => item.key === currentActivityType);
    if (currentActivityType && !currentDefinition) {
      patch.activityType = '';
      patch.activityUnit = '';
      patch.plannedValue = 0;
    }
  }
  if ('activityType' in payload || 'plannedValue' in payload || 'activityUnit' in payload) {
    const activityType = clean(payload.activityType ?? task.activityType);
    const definition = getMetricDefinitions(effectiveDepartment).find(item => item.key === activityType);
    if (activityType && !definition) throw fail('Indicateur métier invalide pour le département du responsable');
    patch.activityType = activityType;
    patch.activityUnit = definition?.unit || clean(payload.activityUnit ?? task.activityUnit);
    patch.plannedValue = Math.max(Number(payload.plannedValue ?? task.plannedValue) || 0, 0);
  }

  if ('sectionId' in payload) patch.sectionId = payload.sectionId || null;
  if ('projectTeamId' in payload) patch.projectTeamId = payload.projectTeamId || null;
  patch.updatedAt = now();
  await db.collection('tasks').doc(taskId).update(patch);
  await audit(user, 'TASK_UPDATED', 'task', taskId, { changes: patch });
  return { ...task, ...patch };
}

export async function updateTaskOrderService(user, taskId, sortOrder) {
  const task = await getTask(user, taskId);
  if (managerRoles.has(user.role)) {
    await assertTaskManagerAccess(user, task);
  } else if (task.assigneeId !== user.uid) {
    throw fail('Accès refusé', 403);
  }
  await db.collection('tasks').doc(taskId).update({ sortOrder: Number(sortOrder) || Date.now(), updatedAt: now() });
  return { ...task, sortOrder: Number(sortOrder) || Date.now() };
}

export async function createSubtasksService(user, taskId, items) {
  const task = await getTask(user, taskId);
  if (managerRoles.has(user.role)) {
    await assertTaskManagerAccess(user, task);
  } else if (task.assigneeId !== user.uid) {
    throw fail('Seul le responsable peut préparer les sous-tâches', 403);
  }
  if (!['TODO', 'IN_PROGRESS'].includes(task.status)) throw fail('Les sous-tâches doivent être préparées avant la soumission');
  if (!Array.isArray(items) || !items.length) throw fail('Au moins une sous-tâche est requise');
  const batch = db.batch();
  const result = [];
  for (const [index, item] of items.entries()) {
    const title = clean(item.title);
    if (!title) continue;
    const ref = db.collection('subtasks').doc();
    const data = { companyId: user.companyId, projectId: task.projectId, taskId, title, description: clean(item.description), order: index, status: 'TODO', createdBy: user.uid, createdAt: now(), updatedAt: now() };
    batch.set(ref, data); result.push({ id: ref.id, ...data });
  }
  if (!result.length) throw fail('Sous-tâches invalides');
  await batch.commit();
  await audit(user, 'SUBTASK_PLAN_CREATED', 'task', taskId, { count: result.length });
  return result;
}

export async function listSubtasksService(user, taskId) {
  const task = await getTask(user, taskId);
  if (managerRoles.has(user.role)) {
    await assertTaskManagerAccess(user, task);
  } else if (task.assigneeId !== user.uid) {
    throw fail('Accès refusé', 403);
  }
  const snap = await db.collection('subtasks').where('taskId', '==', taskId).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order);
}

export async function updateSubtaskService(user, subtaskId, payload) {
  const snap = await db.collection('subtasks').doc(subtaskId).get();
  if (!snap.exists || snap.data().companyId !== user.companyId) throw fail('Sous-tâche introuvable', 404);
  const task = await getTask(user, snap.data().taskId);
  if (task.assigneeId !== user.uid && !managerRoles.has(user.role)) throw fail('Accès refusé', 403);
  const patch = { ...('title' in payload ? { title: clean(payload.title) } : {}), ...('status' in payload ? { status: payload.status } : {}), updatedAt: now() };
  await snap.ref.update(patch);
  return { id: snap.id, ...snap.data(), ...patch };
}

export async function submitTaskService(user, taskId, payload = {}) {
  const task = await getTask(user, taskId);
  if (task.assigneeId !== user.uid && !managerRoles.has(user.role)) throw fail('Accès refusé', 403);
  const sub = await db.collection('subtasks').where('taskId', '==', taskId).get();
  if (!sub.empty && sub.docs.some(d => d.data().status !== 'DONE' && d.data().status !== 'VALIDATED')) throw fail('Toutes les sous-tâches doivent être terminées avant la soumission');
  const patch = { status: 'SUBMITTED', submittedAt: now(), submissionNote: clean(payload.note), updatedAt: now() };
  await db.collection('tasks').doc(taskId).update(patch);
  await audit(user, 'TASK_SUBMITTED', 'task', taskId, { note: payload.note || null });
  return { ...task, ...patch };
}

export async function validateTaskService(user, taskId, decision, note = '') {
  if (!managerRoles.has(user.role)) throw fail('Seul un responsable peut valider', 403);
  const task = await getTask(user, taskId);
  await assertTaskManagerAccess(user, task);
  if (!['SUBMITTED', 'IN_VALIDATION', 'CORRECTION'].includes(task.status)) throw fail('Cette tâche n’est pas en validation');
  if (decision === 'VALIDATE') {
    const patch = { status: 'VALIDATED', validatedAt: now(), completedAt: now(), validationNote: clean(note), updatedAt: now(), blocked: false };
    await db.collection('tasks').doc(taskId).update(patch);
    await audit(user, 'TASK_VALIDATED', 'task', taskId, { note });
    return { ...task, ...patch };
  }
  const patch = { status: 'CORRECTION', rejectionCount: Number(task.rejectionCount || 0) + 1, rejectionNote: clean(note), updatedAt: now() };
  await db.collection('tasks').doc(taskId).update(patch);
  await audit(user, 'TASK_REJECTED', 'task', taskId, { note });
  return { ...task, ...patch };
}
