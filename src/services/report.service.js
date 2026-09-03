import { db } from '../config/firebase.js';

const PERIODS = new Set([30, 90, 180, 365]);

function displayName(user) {
  return [user.prenom, user.nom].filter(Boolean).join(' ').trim() || user.name || user.email || user.uid;
}

export async function buildActivityReport(user, periodValue = 30) {
  const periodDays = PERIODS.has(Number(periodValue)) ? Number(periodValue) : 30;
  const from = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const userSnap = user.companyId ? await db.collection('users').where('companyId', '==', user.companyId).get() : null;
  const users = userSnap ? userSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() })) : [user];
  const usersById = Object.fromEntries(users.map((item) => [item.uid, item]));
  let taskQuery = db.collection('tasks');
  if (user.role === 'EMPLOYEE') taskQuery = taskQuery.where('assigneeId', '==', user.uid);
  else if (user.companyId) taskQuery = taskQuery.where('companyId', '==', user.companyId);
  const taskSnap = await taskQuery.get();
  const tasks = taskSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((task) => new Date(task.createdAt || 0).getTime() >= from);
  const completed = tasks.filter((task) => task.status === 'COMPLETED').length;
  const byEmployee = users.map((item) => {
    const ownTasks = tasks.filter((task) => task.assigneeId === item.uid);
    const done = ownTasks.filter((task) => task.status === 'COMPLETED').length;
    return { uid: item.uid, name: displayName(item), total: ownTasks.length, completed: done, pending: ownTasks.length - done, completionRate: ownTasks.length ? Math.round((done / ownTasks.length) * 100) : 0 };
  }).filter((item) => item.total > 0).sort((a, b) => b.completionRate - a.completionRate || b.completed - a.completed);

  return {
    type: 'ACTIVITY', periodDays, from: new Date(from).toISOString(), to: new Date().toISOString(),
    totalTasks: tasks.length, completedTasks: completed, pendingTasks: tasks.length - completed,
    completionRate: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
    employeeCount: users.filter((item) => item.role === 'EMPLOYEE').length,
    byEmployee,
    recentTasks: tasks.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 10).map((task) => ({ id: task.id, title: task.title, status: task.status, assigneeName: displayName(usersById[task.assigneeId] || { uid: task.assigneeId }), createdAt: task.createdAt })),
  };
}

export async function saveActivityReport(user, period) {
  const stats = await buildActivityReport(user, period);
  const ref = await db.collection('reports').add({ ...stats, ownerUid: user.uid, companyId: user.companyId || null, createdAt: new Date().toISOString() });
  return { id: ref.id, ...stats, ownerUid: user.uid, companyId: user.companyId || null, createdAt: new Date().toISOString() };
}

export async function listActivityReports(user) {
  let query = db.collection('reports');
  if (user.role === 'EMPLOYEE') query = query.where('ownerUid', '==', user.uid);
  else if (user.companyId) query = query.where('companyId', '==', user.companyId);
  const snap = await query.get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function getActivityReport(reportId) {
  const snap = await db.collection('reports').doc(reportId).get();
  if (!snap.exists) throw Object.assign(new Error('Rapport introuvable'), { status: 404 });
  return { id: snap.id, ...snap.data() };
}

function pdfEscape(value) { return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }

export function createReportPdf(report) {
  const lines = [`Rapport d'activite`, `Periode : ${report.periodDays} jours`, `Du ${report.from} au ${report.to}`, `Taches suivies : ${report.totalTasks}`, `Taches realisees : ${report.completedTasks}`, `Taches restantes : ${report.pendingTasks}`, `Taux de realisation : ${report.completionRate}%`, '', 'Performance par employe :', ...((report.byEmployee || []).map((item) => `- ${item.name} : ${item.completed}/${item.total} (${item.completionRate}%)`))];
  const content = ['BT', '/F1 12 Tf', '50 790 Td', ...lines.flatMap((line, index) => [index ? '0 -18 Td' : '', `(${pdfEscape(line)}) Tj`]), 'ET'].filter(Boolean).join('\n');
  const objects = [`1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj`, `2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj`, `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj`, `4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`, `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object) => { offsets.push(pdf.length); pdf += `${object}\n`; });
  const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}
