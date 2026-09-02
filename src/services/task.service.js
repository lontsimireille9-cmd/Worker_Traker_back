import { db } from '../config/firebase.js';

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'REJECTED', 'CANCELLED'];
const MANAGER_ROLES = new Set(['MANAGER', 'ADMIN', 'SUPER_ADMIN']);

function isManagerLike(user) {
  return MANAGER_ROLES.has(user?.role);
}

function toMillis(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function getDisplayName(profile = {}, fallback = '') {
  return [profile.prenom, profile.nom].filter(Boolean).join(' ').trim() || profile.name || profile.email || fallback;
}

function compareTasksDesc(a, b) {
  const orderA = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : toMillis(a.createdAt);
  const orderB = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : toMillis(b.createdAt);

  if (orderA !== orderB) {
    return orderB - orderA;
  }

  return toMillis(b.createdAt) - toMillis(a.createdAt);
}

function normalizeTask(task, usersById, projectsById) {
  const assignee = usersById[task.assigneeId] || {};
  const creator = usersById[task.createdBy] || {};

  return {
    ...task,
    sortOrder: Number.isFinite(Number(task.sortOrder)) ? Number(task.sortOrder) : toMillis(task.createdAt),
    assigneeName: getDisplayName(assignee, task.assigneeId),
    createdByName: getDisplayName(creator, task.createdBy),
    projectName: projectsById[task.projectId]?.name || null,
  };
}

async function loadCompanyReferences(companyId) {
  if (!companyId) {
    return { usersById: {}, projectsById: {} };
  }

  const [usersSnap, projectsSnap] = await Promise.all([
    db.collection('users').where('companyId', '==', companyId).get(),
    db.collection('projects').where('companyId', '==', companyId).get(),
  ]);

  return {
    usersById: Object.fromEntries(usersSnap.docs.map((doc) => [doc.id, { uid: doc.id, ...doc.data() }])),
    projectsById: Object.fromEntries(projectsSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }])),
  };
}

export async function createTaskService(user, payload) {
  const title = String(payload.title || '').trim();
  const description = String(payload.description || '').trim();
  const priority = String(payload.priority || 'MEDIUM').trim().toUpperCase();
  const deadline = payload.deadline ? String(payload.deadline).trim() : null;
  const projectId = payload.projectId ? String(payload.projectId).trim() : null;
  const requestedAssigneeId = payload.assigneeId ? String(payload.assigneeId).trim() : '';

  if (!title) {
    throw Object.assign(new Error('Titre requis'), { status: 400 });
  }

  let assigneeId = requestedAssigneeId;
  if (user.role === 'EMPLOYEE') {
    assigneeId = user.uid;
    if (requestedAssigneeId && requestedAssigneeId !== user.uid) {
      throw Object.assign(new Error('Vous ne pouvez créer que vos propres tâches'), { status: 403 });
    }
  } else if (!assigneeId) {
    throw Object.assign(new Error('Responsable requis'), { status: 400 });
  }

  const assigneeDoc = await db.collection('users').doc(assigneeId).get();
  if (!assigneeDoc.exists) {
    throw Object.assign(new Error('Employé assigné introuvable'), { status: 404 });
  }

  const assignee = assigneeDoc.data();
  const requesterCompanyId = user.companyId || null;

  if (user.role !== 'SUPER_ADMIN' && assignee.companyId !== requesterCompanyId) {
    throw Object.assign(new Error('Employé hors de votre entreprise'), { status: 403 });
  }

  if (user.role === 'MANAGER' && user.teamId && assignee.teamId && assignee.teamId !== user.teamId) {
    throw Object.assign(new Error("Vous ne pouvez assigner qu'aux membres de votre équipe"), { status: 403 });
  }

  if (user.role === 'MANAGER' && user.teamId && !assignee.teamId) {
    throw Object.assign(new Error("Cet employé n'est pas rattaché à votre équipe"), { status: 403 });
  }

  const now = new Date().toISOString();
  const ref = await db.collection('tasks').add({
    title,
    description,
    priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority) ? priority : 'MEDIUM',
    status: 'TODO',
    assigneeId,
    createdBy: user.uid,
    companyId: assignee.companyId || requesterCompanyId,
    projectId,
    deadline,
    sortOrder: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : Date.now(),
    createdAt: now,
    updatedAt: now,
    statusHistory: [{ status: 'TODO', changedAt: now, changedBy: user.uid }],
  });

  return { id: ref.id };
}

export async function listTasksService(user) {
  let query = db.collection('tasks');

  if (user.role === 'EMPLOYEE') {
    query = query.where('assigneeId', '==', user.uid);
  } else if (user.companyId) {
    query = query.where('companyId', '==', user.companyId);
  }

  const snap = await query.get();
  const tasks = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const { usersById, projectsById } = await loadCompanyReferences(user.companyId);

  const visibleTasks = tasks.filter((task) => {
    if (user.role === 'EMPLOYEE') {
      return task.assigneeId === user.uid;
    }

    if (user.role === 'MANAGER' && user.teamId) {
      const assignee = usersById[task.assigneeId] || {};
      return assignee.teamId === user.teamId || task.assigneeId === user.uid;
    }

    return true;
  });

  return visibleTasks.map((task) => normalizeTask(task, usersById, projectsById)).sort(compareTasksDesc);
}

export async function updateTaskStatusService(user, taskId, status) {
  if (!TASK_STATUSES.includes(status)) {
    throw Object.assign(new Error('Statut invalide'), { status: 400 });
  }

  const ref = db.collection('tasks').doc(taskId);
  const doc = await ref.get();
  if (!doc.exists) {
    throw Object.assign(new Error('Tâche introuvable'), { status: 404 });
  }

  const task = doc.data();
  const isOwner = task.assigneeId === user.uid;
  const canManage = isManagerLike(user);

  if (!isOwner && !canManage) {
    throw Object.assign(new Error('Non autorisé à modifier cette tâche'), { status: 403 });
  }

  if (user.role !== 'SUPER_ADMIN' && user.companyId && task.companyId && task.companyId !== user.companyId) {
    throw Object.assign(new Error('Tâche hors de votre entreprise'), { status: 403 });
  }

  const now = new Date().toISOString();
  const historyEntry = { status, changedAt: now, changedBy: user.uid };
  const updates = {
    status,
    updatedAt: now,
    statusHistory: [...(task.statusHistory || []), historyEntry],
  };

  if (status === 'COMPLETED' && task.status !== 'COMPLETED') {
    updates.completedAt = now;
  }

  await ref.update(updates);

  return { message: 'Statut mis à jour' };
}

export async function updateTaskDetailsService(user, taskId, payload) {
  const ref = db.collection('tasks').doc(taskId);
  const doc = await ref.get();
  if (!doc.exists) {
    throw Object.assign(new Error('Tâche introuvable'), { status: 404 });
  }

  const task = doc.data();
  const isOwner = task.assigneeId === user.uid;
  const canManage = isManagerLike(user);

  if (user.role === 'EMPLOYEE' && !isOwner) {
    throw Object.assign(new Error('Non autorisé à modifier cette tâche'), { status: 403 });
  }

  if (!isOwner && !canManage) {
    throw Object.assign(new Error('Non autorisé à modifier cette tâche'), { status: 403 });
  }

  if (user.role !== 'SUPER_ADMIN' && user.companyId && task.companyId && task.companyId !== user.companyId) {
    throw Object.assign(new Error('Tâche hors de votre entreprise'), { status: 403 });
  }

  const now = new Date().toISOString();
  const updates = { updatedAt: now };

  if (payload.title !== undefined) {
    const title = String(payload.title).trim();
    if (!title) {
      throw Object.assign(new Error('Titre requis'), { status: 400 });
    }
    updates.title = title;
  }

  if (payload.description !== undefined) {
    updates.description = String(payload.description).trim();
  }

  if (payload.priority !== undefined && canManage) {
    const priority = String(payload.priority).trim().toUpperCase();
    updates.priority = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority) ? priority : task.priority || 'MEDIUM';
  }

  if (payload.sortOrder !== undefined) {
    if (!canManage) {
      throw Object.assign(new Error('Seul un administrateur peut réordonner les tâches'), { status: 403 });
    }
    updates.sortOrder = Number(payload.sortOrder);
  }

  if (Object.keys(updates).length === 1) {
    throw Object.assign(new Error('Aucune modification à appliquer'), { status: 400 });
  }

  await ref.update(updates);
  return { message: 'Tâche mise à jour' };
}

export async function updateTaskOrderService(user, taskId, sortOrder) {
  if (!Number.isFinite(Number(sortOrder))) {
    throw Object.assign(new Error('Ordre invalide'), { status: 400 });
  }

  const ref = db.collection('tasks').doc(taskId);
  const doc = await ref.get();
  if (!doc.exists) {
    throw Object.assign(new Error('Tâche introuvable'), { status: 404 });
  }

  const task = doc.data();
  if (user.role !== 'SUPER_ADMIN' && user.companyId && task.companyId && task.companyId !== user.companyId) {
    throw Object.assign(new Error('Tâche hors de votre entreprise'), { status: 403 });
  }

  if (!isManagerLike(user)) {
    throw Object.assign(new Error('Seul un administrateur peut réordonner les tâches'), { status: 403 });
  }

  await ref.update({
    sortOrder: Number(sortOrder),
    updatedAt: new Date().toISOString(),
  });

  return { message: 'Ordre mis à jour' };
}
