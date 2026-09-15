import { db } from '../config/firebase.js';

function displayName(user) {
  return [user.prenom, user.nom].filter(Boolean).join(' ').trim() || user.name || user.email || user.uid;
}

function dateOnly(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function mapTaskStatus(task, endDate = new Date()) {
  if (task.status === 'COMPLETED') return 'completed';
  const deadline = task.deadline ? new Date(task.deadline) : null;
  if (deadline && !Number.isNaN(deadline.getTime()) && deadline < endDate) return 'overdue';
  if (['IN_PROGRESS', 'REVIEW'].includes(task.status)) return 'inProgress';
  return 'pending';
}

function normalizePeriod(startDate, endDate) {
  const end = dateOnly(endDate) || new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = dateOnly(startDate) || new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  start.setUTCHours(0, 0, 0, 0);
  if (start > end) throw Object.assign(new Error('La date de début doit précéder la date de fin'), { status: 400 });
  const periodDays = Math.floor((end - start) / 86400000) + 1;
  if (periodDays > 366) throw Object.assign(new Error('La période ne peut pas dépasser 366 jours'), { status: 400 });
  return { start, end, periodDays };
}

export async function buildActivityReport(user, startDate, endDate) {
  const period = normalizePeriod(startDate, endDate);
  const from = period.start.getTime();
  const to = period.end.getTime();
  const userSnap = user.companyId ? await db.collection('users').where('companyId', '==', user.companyId).get() : null;
  const users = userSnap ? userSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() })) : [user];
  const usersById = Object.fromEntries(users.map((item) => [item.uid, item]));
  let taskQuery = db.collection('tasks');
  if (user.role === 'EMPLOYEE') taskQuery = taskQuery.where('assigneeId', '==', user.uid);
  else if (user.companyId) taskQuery = taskQuery.where('companyId', '==', user.companyId);
  const taskSnap = await taskQuery.get();
  const tasks = taskSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((task) => {
    const createdAt = new Date(task.createdAt || 0).getTime();
    return createdAt >= from && createdAt <= to;
  });
  const statusCounts = tasks.reduce((counts, task) => {
    const status = mapTaskStatus(task, period.end);
    counts[status] += 1;
    return counts;
  }, { completed: 0, inProgress: 0, overdue: 0, pending: 0 });
  const dates = Array.from({ length: period.periodDays }, (_, index) => new Date(from + index * 86400000).toISOString().slice(0, 10));
  const byEmployee = users.map((item) => {
    const ownTasks = tasks.filter((task) => task.assigneeId === item.uid);
    const daily = dates.map((date) => ownTasks.filter((task) => task.status === 'COMPLETED' && toDateKey(task.completedAt || task.updatedAt || task.createdAt) === date).length);
    const done = ownTasks.filter((task) => task.status === 'COMPLETED').length;
    return { uid: item.uid, name: displayName(item), total: ownTasks.length, completed: done, pending: ownTasks.length - done, daily, dailyAverage: Number((done / period.periodDays).toFixed(1)), completionRate: ownTasks.length ? Math.round((done / ownTasks.length) * 100) : 0 };
  }).filter((item) => item.total > 0).sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name, 'fr'));
  const daily = dates.map((date) => ({ date, total: tasks.filter((task) => toDateKey(task.createdAt) === date).length, completed: tasks.filter((task) => task.status === 'COMPLETED' && toDateKey(task.completedAt || task.updatedAt || task.createdAt) === date).length, employees: Object.fromEntries(byEmployee.map((employee) => [employee.uid, employee.daily[dates.indexOf(date)]])) }));

  return {
    type: 'ACTIVITY', startDate: period.start.toISOString().slice(0, 10), endDate: period.end.toISOString().slice(0, 10), periodDays: period.periodDays, from: period.start.toISOString(), to: period.end.toISOString(),
    totalTasks: tasks.length, completedTasks: statusCounts.completed, inProgressTasks: statusCounts.inProgress, overdueTasks: statusCounts.overdue, pendingTasks: statusCounts.pending,
    completionRate: tasks.length ? Math.round((statusCounts.completed / tasks.length) * 100) : 0,
    employeeCount: users.filter((item) => item.role === 'EMPLOYEE').length,
    byEmployee,
    daily,
    recentTasks: tasks.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 10).map((task) => ({ id: task.id, title: task.title, status: task.status, assigneeName: displayName(usersById[task.assigneeId] || { uid: task.assigneeId }), createdAt: task.createdAt })),
  };
}

export async function saveActivityReport(user, period) {
  const stats = await buildActivityReport(user, period?.startDate, period?.endDate);
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
