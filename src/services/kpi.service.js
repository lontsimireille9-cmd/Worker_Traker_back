import { db } from '../config/firebase.js';
import { getBusinessKpisService } from './departmentKpi.service.js';

const VALIDATED = new Set(['VALIDATED', 'COMPLETED']);
const OPEN = new Set(['TODO', 'IN_PROGRESS', 'SUBMITTED', 'IN_VALIDATION', 'REJECTED', 'CORRECTION', 'REVIEW']);

const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const dateMs = (v) => { const n = new Date(v || 0).getTime(); return Number.isFinite(n) ? n : 0; };
const nameOf = (u, fallback = 'Utilisateur') => u?.name || [u?.prenom, u?.nom].filter(Boolean).join(' ').trim() || u?.email || fallback;
const clamp = (v) => Math.max(0, Math.min(100, Math.round(num(v))));

function completionAt(task) { return dateMs(task.validatedAt || task.completedAt || task.updatedAt); }
function taskPoints(task) { return Math.max(num(task.estimatePoints, task.weight || 1), 0); }

function periodCompletedPoints(tasks, start, end) {
  return tasks.reduce((sum, task) => {
    if (!VALIDATED.has(task.status)) return sum;
    const at = completionAt(task);
    return at >= start && at < end ? sum + taskPoints(task) : sum;
  }, 0);
}

function periodDelta(tasks, days, now = Date.now()) {
  const dayMs = 24 * 60 * 60 * 1000;
  const currentStart = now - days * dayMs;
  const previousStart = currentStart - days * dayMs;
  const current = periodCompletedPoints(tasks, currentStart, now);
  const previous = periodCompletedPoints(tasks, previousStart, currentStart);

  // Aucune activité sur les deux périodes = pas de donnée, pas "0 % de performance".
  if (!current && !previous) return null;
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function evolutionKpis(tasks) {
  return {
    dod: periodDelta(tasks, 1),
    wow: periodDelta(tasks, 7),
    mom: periodDelta(tasks, 30),
  };
}


function buildSectionKpi(section, sectionTasks) {
  const activeTasks = sectionTasks.filter(t => t.status !== 'CANCELLED');
  const plannedPoints = activeTasks.reduce((sum, task) => sum + taskPoints(task), 0);
  const validatedPoints = activeTasks.reduce((sum, task) => sum + (VALIDATED.has(task.status) ? taskPoints(task) : 0), 0);
  const progress = plannedPoints ? Math.round((validatedPoints / plannedPoints) * 10000) / 100 : 0;
  const overdue = activeTasks.filter(t => !VALIDATED.has(t.status) && t.deadline && dateMs(t.deadline) < Date.now()).length;
  const blocked = activeTasks.filter(t => t.blocked === true || t.status === 'BLOCKED').length;
  return {
    id: section.id,
    name: section.name || 'Section',
    weight: num(section.weight),
    progress,
    status: section.status || 'ACTIVE',
    plannedPoints: Math.round(plannedPoints * 100) / 100,
    validatedPoints: Math.round(validatedPoints * 100) / 100,
    overdue,
    blocked,
  };
}

function buildProjectSections(project, projectTeams, sections, tasks) {
  return projectTeams
    .filter(team => String(team.projectId) === String(project.id) && team.status !== 'CANCELLED')
    .map(team => {
      const teamSections = sections.filter(section => String(section.projectTeamId) === String(team.id) && section.status !== 'CANCELLED');
      const teamWeight = num(team.weight);
      const sectionWeightTotal = teamSections.reduce((sum, section) => sum + Math.max(num(section.weight), 0), 0);
      return teamSections.map(section => {
        const kpi = buildSectionKpi(section, tasks.filter(task => String(task.sectionId) === String(section.id)));
        const normalizedSectionWeight = sectionWeightTotal > 0 ? (kpi.weight / sectionWeightTotal) * 100 : 0;
        return {
          ...kpi,
          teamId: team.teamId || null,
          projectTeamId: team.id,
          teamName: team.teamName || null,
          teamWeight,
          normalizedWeight: Math.round(normalizedSectionWeight * 100) / 100,
          contribution: Math.round((teamWeight / 100) * (normalizedSectionWeight / 100) * kpi.progress * 100) / 100,
        };
      });
    })
    .flat()
    .sort((a, b) => b.progress - a.progress);
}

/**
 * Progression projet/section = travail pondéré réellement validé / travail pondéré prévu.
 * Ce n'est PAS un KPI de personne : c'est un indicateur d'avancement.
 */
export function calculateWeightedProgress(project, teams, sections, tasks) {
  const projectTeams = teams.filter(t => t.projectId === project.id && t.status !== 'CANCELLED');
  if (!projectTeams.length) return 0;
  let total = 0;
  let weightTotal = 0;

  for (const pt of projectTeams) {
    const teamWeight = num(pt.weight);
    if (teamWeight <= 0) continue;
    weightTotal += teamWeight;
    const teamSections = sections.filter(s => s.projectId === project.id && s.projectTeamId === pt.id && s.status !== 'CANCELLED');
    let sectionProgress = 0;
    let sectionWeight = 0;

    for (const section of teamSections) {
      const w = num(section.weight);
      if (w <= 0) continue;
      sectionWeight += w;
      const sectionTasks = tasks.filter(t => t.projectId === project.id && t.sectionId === section.id && t.status !== 'CANCELLED');
      const taskWeight = sectionTasks.reduce((sum, t) => sum + taskPoints(t), 0);
      const validated = sectionTasks.reduce((sum, t) => sum + (VALIDATED.has(t.status) ? taskPoints(t) : 0), 0);
      const p = taskWeight ? validated / taskWeight * 100 : 0;
      sectionProgress += w * p;
    }

    const teamProgress = sectionWeight ? sectionProgress / sectionWeight : 0;
    total += teamWeight * teamProgress;
  }

  return weightTotal ? Math.round((total / weightTotal) * 100) / 100 : 0;
}

/**
 * Indicateurs d'exécution. On garde les mesures brutes séparées : elles sont
 * réutilisables pour les projets, sections, employés et équipes.
 */
export function calculateTaskKpis(tasks, now = new Date()) {
  const total = tasks.length;
  const validated = tasks.filter(t => VALIDATED.has(t.status)).length;
  const submitted = tasks.filter(t => ['SUBMITTED', 'IN_VALIDATION', ...VALIDATED].includes(t.status)).length;
  const rejected = tasks.filter(t => ['REJECTED', 'CORRECTION'].includes(t.status) || num(t.rejectionCount) > 0).length;
  const blocked = tasks.filter(t => t.blocked === true || t.status === 'BLOCKED').length;
  const overdue = tasks.filter(t => !VALIDATED.has(t.status) && t.deadline && dateMs(t.deadline) < now.getTime()).length;

  const withDeadline = tasks.filter(t => VALIDATED.has(t.status) && t.deadline);
  const completedOnTime = withDeadline.filter(t => completionAt(t) <= dateMs(t.deadline)).length;
  const firstPass = tasks.filter(t => VALIDATED.has(t.status) && num(t.rejectionCount) === 0).length;

  const effortAssigned = tasks.reduce((sum, t) => sum + taskPoints(t), 0);
  const effortValidated = tasks.reduce((sum, t) => sum + (VALIDATED.has(t.status) ? taskPoints(t) : 0), 0);

  const completionRate = effortAssigned ? clamp(effortValidated / effortAssigned * 100) : null;
  const onTimeRate = withDeadline.length ? clamp(completedOnTime / withDeadline.length * 100) : null;
  const firstPassRate = validated ? clamp(firstPass / validated * 100) : null;

  // Indice d'exécution : mesure interne à Teamora, distinct d'un KPI métier.
  // 50% avancement pondéré, 30% respect des échéances, 20% qualité au premier passage.
  const available = [completionRate, onTimeRate, firstPassRate].filter(v => v !== null);
  const executionScore = available.length
    ? clamp((completionRate ?? 0) * 0.5 + (onTimeRate ?? completionRate ?? 0) * 0.3 + (firstPassRate ?? completionRate ?? 0) * 0.2)
    : null;

  return {
    total,
    validated,
    submitted,
    rejected,
    blocked,
    overdue,
    completionRate,
    validationRate: submitted ? clamp(validated / submitted * 100) : null,
    firstPassRate,
    onTimeRate,
    effortAssigned: Math.round(effortAssigned * 100) / 100,
    effortValidated: Math.round(effortValidated * 100) / 100,
    effortRate: completionRate,
    executionScore,
    open: tasks.filter(t => OPEN.has(t.status)).length,
    evolution: evolutionKpis(tasks),
  };
}

function buildTeamKpis(team, relations, sections, tasks, usersById) {
  const relationIds = new Set(relations.map(r => String(r.id)));
  const teamSections = sections.filter(s => relationIds.has(String(s.projectTeamId)) || String(s.teamId || '') === String(team.id));
  const sectionIds = new Set(teamSections.map(s => String(s.id)));
  const teamTasks = tasks.filter(t => sectionIds.has(String(t.sectionId)) || String(t.teamId || '') === String(team.id));

  const memberIds = new Set([
    ...(Array.isArray(team.memberIds) ? team.memberIds : []),
    ...relations.flatMap(r => Array.isArray(r.memberIds) ? r.memberIds : []),
    ...relations.map(r => r.managerId).filter(Boolean),
    team.leaderId,
    team.managerId,
  ].filter(Boolean).map(String));

  const members = [...memberIds].map(uid => usersById.get(uid)).filter(Boolean);
  const kpis = calculateTaskKpis(teamTasks);

  return {
    id: String(team.id),
    name: team.name || team.title || relations[0]?.teamName || 'Équipe',
    managerName: nameOf(usersById.get(String(team.managerId || relations.find(r => r.managerId)?.managerId || '')), 'Non défini'),
    memberCount: members.length,
    // Pour une équipe, on affiche l'indice d'exécution et non un faux "KPI métier".
    progress: kpis.executionScore ?? 0,
    kpis,
  };
}

async function getDashboardMemberKpis(user, teamMasters, projectTeams, sections, tasks, users) {
  if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) return [];
  const usersById = new Map(users.map(u => [String(u.uid), u]));
  const managedTeamIds = new Set();

  if (user.role === 'MANAGER') {
    teamMasters.filter(t => String(t.managerId || t.leaderId || '') === String(user.uid)).forEach(t => managedTeamIds.add(String(t.id)));
    projectTeams.filter(r => String(r.managerId || '') === String(user.uid)).forEach(r => managedTeamIds.add(String(r.teamId || '')));
  }

  const visibleMasters = user.role === 'MANAGER'
    ? teamMasters.filter(t => managedTeamIds.has(String(t.id)))
    : teamMasters;
  const visibleRelations = user.role === 'MANAGER'
    ? projectTeams.filter(r => managedTeamIds.has(String(r.teamId || '')))
    : projectTeams;

  const memberIds = new Set();
  visibleMasters.forEach(team => {
    (Array.isArray(team.memberIds) ? team.memberIds : []).forEach(id => memberIds.add(String(id)));
    if (team.managerId) memberIds.add(String(team.managerId));
    if (team.leaderId) memberIds.add(String(team.leaderId));
  });
  visibleRelations.forEach(relation => {
    (Array.isArray(relation.memberIds) ? relation.memberIds : []).forEach(id => memberIds.add(String(id)));
    if (relation.managerId) memberIds.add(String(relation.managerId));
  });
  if (user.role === 'MANAGER') memberIds.add(String(user.uid));
  if (user.role !== 'MANAGER') {
    users.filter(u => ['EMPLOYEE', 'MANAGER'].includes(String(u.role || '').toUpperCase())).forEach(u => memberIds.add(String(u.uid)));
  }

  // Un manager ne voit que les sections rattachées à ses propres équipes.
  // Cela évite qu'une section d'une autre équipe apparaisse simplement parce
  // qu'elle est attribuée au même utilisateur.
  const visibleTeamIds = new Set(
    visibleMasters.map(t => String(t.id)).concat(visibleRelations.map(r => String(r.teamId || '')))
  );
  const visibleProjectTeamIds = new Set(
    visibleRelations.map(r => String(r.id))
  );
  const visibleSections = user.role === 'MANAGER'
    ? sections.filter(section =>
        visibleProjectTeamIds.has(String(section.projectTeamId || '')) ||
        visibleTeamIds.has(String(section.teamId || ''))
      )
    : sections;

  const assignedSectionsByUser = new Map();
  visibleSections.forEach(section => {
    if (!section.assigneeId) return;
    const uid = String(section.assigneeId);
    if (!memberIds.has(uid)) return;
    if (!assignedSectionsByUser.has(uid)) assignedSectionsByUser.set(uid, []);
    assignedSectionsByUser.get(uid).push(section);
  });

  return [...memberIds].map(uid => {
    const member = usersById.get(uid) || { uid };
    const memberSections = assignedSectionsByUser.get(uid) || [];
    const sectionIds = new Set(memberSections.map(s => String(s.id)));
    const memberTasks = tasks.filter(t => String(t.assigneeId || '') === uid || sectionIds.has(String(t.sectionId)));
    const kpis = calculateTaskKpis(memberTasks);
    const projectNames = [...new Set(memberSections.map(s => s.projectName).filter(Boolean))];
    const sectionNames = memberSections.map(s => s.name).filter(Boolean);

    return {
      uid,
      name: nameOf(member, uid),
      role: member.role || 'EMPLOYEE',
      sectionCount: memberSections.length,
      sectionNames,
      projectNames,
      teams: visibleMasters.filter(team =>
        (team.memberIds || []).map(String).includes(uid) || String(team.managerId || team.leaderId || '') === uid
      ).map(team => ({ id: team.id, name: team.name })),
      kpis,
      // Nom explicite pour éviter de présenter cet indice comme un KPI métier universel.
      performance: kpis.executionScore,
    };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
}

async function getDashboardTeamKpis(user, teamMasters, projectTeams, sections, tasks, users) {
  if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) return [];
  const visibleMasters = user.role === 'MANAGER'
    ? teamMasters.filter(t => String(t.managerId || t.leaderId || '') === String(user.uid))
    : teamMasters;
  // Pour un manager, ne jamais reconstruire une liste depuis toutes les
  // relations projet : cela pourrait exposer une équipe qu'il ne gère pas.
  const masters = user.role === 'MANAGER' ? visibleMasters : (visibleMasters.length ? visibleMasters : (() => {
    const ids = new Set(projectTeams.map(r => String(r.teamId || '')).filter(Boolean));
    return [...ids].map(id => ({ id, name: projectTeams.find(r => String(r.teamId) === id)?.teamName || 'Équipe', memberIds: [] }));
  })());
  const usersById = new Map(users.map(u => [String(u.uid), u]));
  return masters.map(team => {
    const relations = projectTeams.filter(r => String(r.teamId || '') === String(team.id));
    return buildTeamKpis(team, relations, sections, tasks, usersById);
  }).sort((a, b) => (b.progress || 0) - (a.progress || 0));
}

export async function getCompanyAnalytics(user) {
  if (!user.companyId) throw Object.assign(new Error('Aucune entreprise associée'), { status: 400 });
  const companyId = user.companyId;
  const [projectsSnap, projectTeamsSnap, sectionsSnap, tasksSnap, usersSnap] = await Promise.all([
    db.collection('projects').where('companyId', '==', companyId).get(),
    db.collection('projectTeams').where('companyId', '==', companyId).get(),
    db.collection('projectSections').where('companyId', '==', companyId).get(),
    db.collection('tasks').where('companyId', '==', companyId).get(),
    db.collection('users').where('companyId', '==', companyId).get(),
  ]);

  const projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const projectTeams = projectTeamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sections = sectionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));

  let teamMasters = [];
  try {
    const snap = await db.collection('teams').where('companyId', '==', companyId).get();
    teamMasters = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    teamMasters = [];
  }

  let visibleProjects = projects;
  if (user.role === 'MANAGER') {
    const managedTeamIds = new Set([
      ...teamMasters.filter(t => String(t.managerId || t.leaderId || '') === String(user.uid)).map(t => String(t.id)),
      ...projectTeams.filter(r => String(r.managerId || '') === String(user.uid)).map(r => String(r.teamId || '')),
    ]);
    const managedProjectIds = new Set(projectTeams.filter(r => managedTeamIds.has(String(r.teamId || ''))).map(r => String(r.projectId || '')));
    // Un manager ne voit que les projets rattachés à ses équipes.
    visibleProjects = projects.filter(project => managedProjectIds.has(String(project.id)));
  } else if (user.role === 'EMPLOYEE') {
    visibleProjects = projects.filter(project => project.approvalStatus === 'APPROVED' && tasks.some(task => String(task.projectId) === String(project.id) && String(task.assigneeId) === String(user.uid)));
  }

  const projectRows = visibleProjects.map(project => {
    const pt = projectTeams.filter(t => t.projectId === project.id);
    const ps = sections.filter(s => s.projectId === project.id);
    const ts = tasks.filter(t => t.projectId === project.id);
    const sectionsKpi = buildProjectSections(project, pt, ps, ts);
    return {
      ...project,
      progress: calculateWeightedProgress(project, pt, ps, ts),
      sectionCount: sectionsKpi.length,
      sections: sectionsKpi,
      kpis: calculateTaskKpis(ts),
    };
  });

  let scopedTasks = tasks;
  if (user.role === 'MANAGER') {
    const managedTeamIds = new Set([
      ...teamMasters.filter(t => String(t.managerId || t.leaderId || '') === String(user.uid)).map(t => String(t.id)),
      ...projectTeams.filter(r => String(r.managerId || '') === String(user.uid)).map(r => String(r.teamId || '')),
    ]);
    // Même règle pour les tâches : uniquement celles de ses équipes.
    // Les tâches héritent souvent de la section plutôt que de teamId.
    const managedProjectTeamIds = new Set(
      projectTeams.filter(r => managedTeamIds.has(String(r.teamId || ''))).map(r => String(r.id))
    );
    const managedSectionIds = new Set(
      sections.filter(s => managedProjectTeamIds.has(String(s.projectTeamId || '')) || managedTeamIds.has(String(s.teamId || ''))).map(s => String(s.id))
    );
    scopedTasks = tasks.filter(task =>
      managedTeamIds.has(String(task.teamId || '')) ||
      managedSectionIds.has(String(task.sectionId || ''))
    );
  } else if (user.role === 'EMPLOYEE') {
    scopedTasks = tasks.filter(task => String(task.assigneeId || '') === String(user.uid));
  }

  const memberKpis = await getDashboardMemberKpis(user, teamMasters, projectTeams, sections, tasks, users);
  const teamKpis = await getDashboardTeamKpis(user, teamMasters, projectTeams, sections, tasks, users);
  const activeProjects = projectRows.filter(p => ['ACTIVE', 'PLANNED', 'PAUSED'].includes(p.status));
  const overallWeight = projectRows.reduce((sum, p) => sum + Math.max(num(p.totalWeight, 1), 1), 0);
  const progress = overallWeight ? Math.round(projectRows.reduce((sum, p) => sum + p.progress * Math.max(num(p.totalWeight, 1), 1), 0) / overallWeight * 100) / 100 : 0;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      activeProjects: activeProjects.length,
      totalProjects: projectRows.length,
      overallProgress: progress,
      overdueTasks: scopedTasks.filter(t => !VALIDATED.has(t.status) && t.deadline && dateMs(t.deadline) < Date.now()).length,
      blockedTasks: scopedTasks.filter(t => t.blocked || t.status === 'BLOCKED').length,
      pendingValidations: scopedTasks.filter(t => ['SUBMITTED', 'IN_VALIDATION'].includes(t.status)).length,
      employees: user.role === 'MANAGER'
        ? memberKpis.length
        : users.filter(u => ['EMPLOYEE', 'MANAGER'].includes(String(u.role || '').toUpperCase())).length,
      taskKpis: calculateTaskKpis(scopedTasks),
    },
    projects: projectRows.sort((a, b) => b.progress - a.progress),
    memberKpis,
    teamKpis,
    businessKpis: await getBusinessKpisService(user),
    alerts: projectRows.flatMap(p => {
      const a = [];
      if (p.kpis.overdue) a.push({ type: 'OVERDUE', severity: 'HIGH', projectId: p.id, projectName: p.name, count: p.kpis.overdue });
      if (p.kpis.blocked) a.push({ type: 'BLOCKED', severity: 'HIGH', projectId: p.id, projectName: p.name, count: p.kpis.blocked });
      if (p.kpis.submitted - p.kpis.validated > 0) a.push({ type: 'VALIDATION', severity: 'MEDIUM', projectId: p.id, projectName: p.name, count: p.kpis.submitted - p.kpis.validated });
      return a;
    }),
  };
}

export async function getProjectAnalytics(user, projectId) {
  const result = await getCompanyAnalytics(user);
  const project = result.projects.find(p => p.id === projectId);
  if (!project) throw Object.assign(new Error('Projet introuvable ou accès refusé'), { status: 404 });
  const [teamsSnap, sectionsSnap, tasksSnap] = await Promise.all([
    db.collection('projectTeams').where('projectId', '==', projectId).get(),
    db.collection('projectSections').where('projectId', '==', projectId).get(),
    db.collection('tasks').where('projectId', '==', projectId).get(),
  ]);
  const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sections = sectionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  let tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (user.role === 'EMPLOYEE') tasks = tasks.filter(t => t.assigneeId === user.uid);
  const projectSections = buildProjectSections(project, teams, sections, tasks);
  return {
    project: { ...project, sectionCount: projectSections.length, sections: projectSections },
    teams: teams.map(t => ({
      ...t,
      sections: sections
        .filter(s => s.projectTeamId === t.id)
        .map(s => ({
          ...s,
          kpi: buildSectionKpi(s, tasks.filter(task => task.sectionId === s.id)),
          tasks: tasks.filter(task => task.sectionId === s.id),
        })),
    })),
    sections: projectSections,
    kpis: calculateTaskKpis(tasks),
  };
}
