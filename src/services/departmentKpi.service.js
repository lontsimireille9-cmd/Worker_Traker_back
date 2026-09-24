import { db } from '../config/firebase.js';
import { normalizeDepartment, getDepartmentDefinition } from '../constants/departments.js';

const MANAGER_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MANAGER']);
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const clean = (v) => String(v ?? '').trim();
const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const startOfWeek = (d = new Date()) => { const x = startOfDay(d); const day = x.getDay() || 7; x.setDate(x.getDate() - day + 1); return x; };
const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfNextMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
const startOfYear = (d = new Date()) => new Date(d.getFullYear(), 0, 1);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

function periodBounds(period, now = new Date()) {
  const end = new Date(now);
  if (period === 'day') return [startOfDay(now), end];
  if (period === 'week') return [startOfWeek(now), end];
  if (period === 'month') return [startOfMonth(now), end];
  if (period === 'year') return [startOfYear(now), end];
  return [new Date(0), end];
}

function previousBounds(period, now = new Date()) {
  const [currentStart] = periodBounds(period, now);
  if (period === 'day') return [addDays(currentStart, -1), currentStart];
  if (period === 'week') return [addDays(currentStart, -7), currentStart];
  if (period === 'month') return [new Date(now.getFullYear(), now.getMonth() - 1, 1), currentStart];
  if (period === 'year') return [new Date(now.getFullYear() - 1, 0, 1), currentStart];
  return [new Date(0), new Date(0)];
}

function inRange(date, [start, end]) {
  const t = new Date(date || 0).getTime();
  return t >= start.getTime() && t < end.getTime();
}

function sum(entries, key) { return entries.reduce((a, e) => a + num(e.metrics?.[key]), 0); }
function delta(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

const METRIC_DEFINITIONS = {
  PROJECT: [],
  SALES: [
    { key: 'salesCount', label: 'Ventes réalisées', unit: 'vente(s)' },
    { key: 'revenue', label: 'Chiffre d’affaires', unit: 'FCFA' },
    { key: 'profit', label: 'Résultat', unit: 'FCFA' },
  ],
  MARKETING: [
    { key: 'prospects', label: 'Prospects', unit: 'prospect(s)' },
    { key: 'qualifiedLeads', label: 'Leads qualifiés', unit: 'lead(s)' },
    { key: 'conversions', label: 'Conversions', unit: 'conversion(s)' },
    { key: 'spend', label: 'Dépenses marketing', unit: 'FCFA' },
  ],
  FINANCE: [
    { key: 'revenue', label: 'Revenus', unit: 'FCFA' },
    { key: 'expenses', label: 'Dépenses', unit: 'FCFA' },
    { key: 'profit', label: 'Résultat', unit: 'FCFA' },
  ],
  LOGISTICS: [
    { key: 'orders', label: 'Commandes', unit: 'commande(s)' },
    { key: 'deliveries', label: 'Livraisons', unit: 'livraison(s)' },
    { key: 'onTimeDeliveries', label: 'Livraisons à temps', unit: 'livraison(s)' },
    { key: 'incidents', label: 'Incidents', unit: 'incident(s)' },
  ],
  STOCK: [
    { key: 'stockIn', label: 'Entrées', unit: 'unité(s)' },
    { key: 'stockOut', label: 'Sorties', unit: 'unité(s)' },
    { key: 'stockLevel', label: 'Stock disponible', unit: 'unité(s)' },
    { key: 'stockouts', label: 'Ruptures', unit: 'rupture(s)' },
  ],
  PRODUCTION: [
    { key: 'produced', label: 'Production réalisée', unit: 'unité(s)' },
    { key: 'target', label: 'Objectif de production', unit: 'unité(s)' },
    { key: 'defects', label: 'Défauts', unit: 'défaut(s)' },
  ],
  HR: [
    { key: 'recruits', label: 'Recrutements', unit: 'personne(s)' },
    { key: 'training', label: 'Formations réalisées', unit: 'formation(s)' },
    { key: 'absences', label: 'Absences', unit: 'jour(s)' },
  ],
  CUSTOMER_SERVICE: [
    { key: 'tickets', label: 'Demandes reçues', unit: 'demande(s)' },
    { key: 'resolved', label: 'Demandes résolues', unit: 'demande(s)' },
    { key: 'satisfaction', label: 'Satisfaction moyenne', unit: '%' },
  ],
  ADMIN: [
    { key: 'processed', label: 'Dossiers traités', unit: 'dossier(s)' },
    { key: 'overdue', label: 'Dossiers en retard', unit: 'dossier(s)' },
    { key: 'incidents', label: 'Incidents', unit: 'incident(s)' },
  ],
  IT: [
    { key: 'incidents', label: 'Incidents', unit: 'incident(s)' },
    { key: 'resolved', label: 'Incidents résolus', unit: 'incident(s)' },
    { key: 'deployments', label: 'Déploiements', unit: 'déploiement(s)' },
  ],
  OTHER: [
    { key: 'activity', label: 'Activité réalisée', unit: 'unité(s)' },
    { key: 'target', label: 'Objectif', unit: 'unité(s)' },
  ],
};

export function getMetricDefinitions(department) {
  return METRIC_DEFINITIONS[normalizeDepartment(department)] || [];
}

function calculatePerformance(department, entries) {
  const d = normalizeDepartment(department);
  const v = (key) => sum(entries, key);
  if (d === 'SALES') return v('revenue') || v('salesCount');
  if (d === 'MARKETING') return v('conversions') || v('qualifiedLeads') || v('prospects');
  if (d === 'FINANCE') return v('profit') || v('revenue');
  if (d === 'LOGISTICS') return v('onTimeDeliveries') || v('deliveries');
  if (d === 'STOCK') return v('stockOut') || v('stockIn');
  if (d === 'PRODUCTION') return v('produced');
  if (d === 'HR') return v('recruits') || v('training');
  if (d === 'CUSTOMER_SERVICE') return v('resolved') || v('tickets');
  if (d === 'ADMIN') return v('processed');
  if (d === 'IT') return v('resolved') || v('deployments');
  return v('activity');
}

function buildDepartmentKpi(department, entries, previousEntries) {
  const definition = getDepartmentDefinition(department);
  const metrics = getMetricDefinitions(department).map((m) => ({
    ...m,
    value: sum(entries, m.key),
    previous: sum(previousEntries, m.key),
    delta: delta(sum(entries, m.key), sum(previousEntries, m.key)),
  }));
  const performance = calculatePerformance(department, entries);
  const previousPerformance = calculatePerformance(department, previousEntries);
  return {
    department: normalizeDepartment(department),
    label: definition.label,
    metrics,
    performance,
    previousPerformance,
    performanceDelta: delta(performance, previousPerformance),
    entryCount: entries.length,
  };
}

async function getScopedEmployees(user) {
  const snap = await db.collection('users').where('companyId', '==', user.companyId).get();
  let users = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  if (user.role === 'MANAGER') {
    const teamsSnap = await db.collection('teams').where('companyId', '==', user.companyId).get();
    const teams = teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const teamIds = new Set(teams.filter((t) => String(t.leaderId || '') === String(user.uid) || (t.memberIds || []).map(String).includes(String(user.uid))).map((t) => String(t.id)));
    const memberIds = new Set([String(user.uid)]);
    teams.filter((t) => teamIds.has(String(t.id))).forEach((t) => (t.memberIds || []).forEach((id) => memberIds.add(String(id))));
    users = users.filter((u) => memberIds.has(String(u.uid)));
  } else if (user.role === 'EMPLOYEE') {
    users = users.filter((u) => String(u.uid) === String(user.uid));
  }
  return users;
}

export async function listDepartmentMetricsService(user, filters = {}) {
  if (!user.companyId) return [];
  const employees = await getScopedEmployees(user);
  const employeeIds = new Set(employees.map((e) => String(e.uid)));
  let snap = await db.collection('departmentMetrics').where('companyId', '==', user.companyId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((entry) => employeeIds.has(String(entry.employeeId))).filter((entry) => !filters.department || normalizeDepartment(entry.department) === normalizeDepartment(filters.department));
}

export async function createDepartmentMetricService(user, payload) {
  if (!user.companyId) throw Object.assign(new Error('Aucune entreprise associée'), { status: 400 });
  const employeeId = String(payload.employeeId || user.uid);
  const employees = await getScopedEmployees(user);
  const employee = employees.find((e) => String(e.uid) === employeeId);
  if (!employee) throw Object.assign(new Error('Vous ne pouvez pas saisir des données pour cet employé'), { status: 403 });
  const department = normalizeDepartment(payload.department || employee.department);
  if (department === 'PROJECT') throw Object.assign(new Error('Le Département projet est alimenté par les projets et les tâches.'), { status: 400 });
  const definitions = getMetricDefinitions(department);
  const metrics = {};
  for (const d of definitions) metrics[d.key] = Math.max(0, num(payload.metrics?.[d.key]));
  const date = payload.date ? new Date(payload.date) : new Date();
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error('Date invalide'), { status: 400 });
  const data = { companyId: user.companyId, employeeId, teamId: employee.teamId || null, department, date: date.toISOString(), metrics, note: clean(payload.note), createdBy: user.uid, updatedAt: new Date().toISOString() };
  const ref = await db.collection('departmentMetrics').add(data);
  return { id: ref.id, ...data };
}

export async function getBusinessKpisService(user) {
  if (!user.companyId) return { departments: [], employees: [] };
  const [entries, employees] = await Promise.all([listDepartmentMetricsService(user), getScopedEmployees(user)]);
  const now = new Date();
  const byDepartment = new Map();
  for (const e of employees) {
    const dep = normalizeDepartment(e.department);
    if (!byDepartment.has(dep)) byDepartment.set(dep, []);
    byDepartment.get(dep).push(e);
  }
  const departments = [...byDepartment.entries()].map(([department, members]) => {
    const ownEntries = entries.filter((e) => normalizeDepartment(e.department) === department);
    const [currentStart, currentEnd] = periodBounds('month', now);
    const [previousStart, previousEnd] = previousBounds('month', now);
    const current = ownEntries.filter((e) => inRange(e.date, [currentStart, currentEnd]));
    const previous = ownEntries.filter((e) => inRange(e.date, [previousStart, previousEnd]));
    const base = buildDepartmentKpi(department, current, previous);
    return { ...base, memberCount: members.length };
  }).filter((d) => d.department !== 'PROJECT');

  const employeeRows = employees.map((employee) => {
    const department = normalizeDepartment(employee.department);
    const ownEntries = entries.filter((e) => String(e.employeeId) === String(employee.uid));
    const [currentStart, currentEnd] = periodBounds('month', now);
    const [previousStart, previousEnd] = previousBounds('month', now);
    const current = ownEntries.filter((e) => inRange(e.date, [currentStart, currentEnd]));
    const previous = ownEntries.filter((e) => inRange(e.date, [previousStart, previousEnd]));
    return { uid: employee.uid, name: [employee.prenom, employee.nom].filter(Boolean).join(' ').trim() || employee.name || employee.email || employee.uid, role: employee.role || 'EMPLOYEE', department, departmentLabel: getDepartmentDefinition(department).label, kpi: buildDepartmentKpi(department, current, previous) };
  });
  return { generatedAt: now.toISOString(), departments, employees: employeeRows, metricDefinitions: Object.fromEntries(Object.keys(METRIC_DEFINITIONS).map((key) => [key, METRIC_DEFINITIONS[key]])) };
}
