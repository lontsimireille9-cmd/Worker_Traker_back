import { db } from '../config/firebase.js';

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'REJECTED', 'CANCELLED'];

export async function createTaskService(user, payload) {
  const { title, description, priority, assigneeId, deadline, projectId } = payload;

  if (!title || !assigneeId) {
    throw Object.assign(new Error('Titre et responsable requis'), { status: 400 });
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
    throw Object.assign(new Error('Vous ne pouvez assigner qu’aux membres de votre équipe'), { status: 403 });
  }

  if (user.role === 'MANAGER' && user.teamId && !assignee.teamId) {
    throw Object.assign(new Error('Cet employé n’est pas rattaché à votre équipe'), { status: 403 });
  }

  const now = new Date().toISOString();
  const ref = await db.collection('tasks').add({
    title,
    description: description || '',
    priority: priority || 'MEDIUM',
    status: 'TODO',
    assigneeId,
    createdBy: user.uid,
    companyId: assignee.companyId || requesterCompanyId,
    projectId: projectId || null,
    deadline: deadline || null,
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
  const usersSnap = await db.collection('users').where('companyId', '==', user.companyId).get();
  const usersById = Object.fromEntries(usersSnap.docs.map((doc) => [doc.id, { uid: doc.id, ...doc.data() }]));

  const projectsSnap = await db.collection('projects').where('companyId', '==', user.companyId).get();
  const projectsById = Object.fromEntries(projectsSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));

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

  return visibleTasks
    .map((task) => ({
      ...task,
      assigneeName: [usersById[task.assigneeId]?.prenom, usersById[task.assigneeId]?.nom].filter(Boolean).join(' ').trim() || usersById[task.assigneeId]?.email || task.assigneeId,
      projectName: projectsById[task.projectId]?.name || null,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
  const isManager = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role);

  if (!isOwner && !isManager) {
    throw Object.assign(new Error('Non autorisé à modifier cette tâche'), { status: 403 });
  }

  const historyEntry = { status, changedAt: new Date().toISOString(), changedBy: user.uid };
  const updates = {
    status,
    updatedAt: new Date().toISOString(),
    statusHistory: [...(task.statusHistory || []), historyEntry],
  };

  if (status === 'COMPLETED') {
    updates.completionNotification = {
      sentTo: task.createdBy || null,
      sentAt: new Date().toISOString(),
    };
  }

  await ref.update(updates);

  return { message: 'Statut mis à jour' };
}
