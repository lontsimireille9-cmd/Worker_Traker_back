import { db } from '../config/firebase.js';

export async function createProjectService(user, payload) {
  if (!user.companyId) {
    throw Object.assign(new Error('Créez d’abord votre entreprise'), { status: 400 });
  }

  const name = String(payload.name || '').trim();
  const teamId = payload.teamId ? String(payload.teamId) : null;
  if (!name) {
    throw Object.assign(new Error('Nom du projet requis'), { status: 400 });
  }

  const now = new Date().toISOString();
  const project = {
    name,
    teamId,
    companyId: user.companyId,
    createdBy: user.uid,
    deadline: payload.deadline || null,
    status: 'IN_PROGRESS',
    createdAt: now,
    updatedAt: now,
  };

  const ref = await db.collection('projects').add(project);
  return { id: ref.id, ...project };
}

export async function listProjectsService(user) {
  if (!user.companyId) {
    return [];
  }

  const snap = await db.collection('projects').where('companyId', '==', user.companyId).get();
  const projects = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const taskSnap = await db.collection('tasks').where('companyId', '==', user.companyId).get();
  const tasks = taskSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return projects.map((project) => ({
    ...project,
    tasks: tasks.filter((task) => task.projectId === project.id),
    lateCount: tasks.filter((task) => task.projectId === project.id && task.status !== 'COMPLETED' && task.deadline && new Date(task.deadline) < new Date()).length,
  }));
}

export async function getProjectService(user, projectId) {
  const doc = await db.collection('projects').doc(projectId).get();
  if (!doc.exists) {
    throw Object.assign(new Error('Projet introuvable'), { status: 404 });
  }

  const project = { id: doc.id, ...doc.data() };
  const taskSnap = await db.collection('tasks').where('projectId', '==', projectId).get();
  project.tasks = taskSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return project;
}
