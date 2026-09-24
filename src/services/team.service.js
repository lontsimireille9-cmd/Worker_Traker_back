import { db } from '../config/firebase.js';
import { normalizeDepartment } from '../constants/departments.js';

const MANAGER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
const VALIDATED = new Set(['VALIDATED', 'COMPLETED']);

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const dateMs = (value) => {
  const n = new Date(value || 0).getTime();
  return Number.isFinite(n) ? n : 0;
};

function taskEstimate(task) {
  return Math.max(
    toNumber(
      task.estimatedPoints,
      toNumber(task.estimatePoints, toNumber(task.weight, 1))
    ),
    0
  );
}

function calculateMemberKpis(tasks, now = Date.now()) {
  const total = tasks.length;
  const validated = tasks.filter((task) => VALIDATED.has(task.status)).length;

  const submitted = tasks.filter((task) =>
    ['SUBMITTED', 'IN_VALIDATION', 'VALIDATED', 'COMPLETED'].includes(task.status)
  ).length;

  const rejected = tasks.filter(
    (task) =>
      ['REJECTED', 'CORRECTION'].includes(task.status) ||
      toNumber(task.rejectionCount) > 0
  ).length;

  const blocked = tasks.filter(
    (task) => task.blocked === true || task.status === 'BLOCKED'
  ).length;

  const overdue = tasks.filter(
    (task) =>
      !VALIDATED.has(task.status) &&
      task.deadline &&
      dateMs(task.deadline) < now
  ).length;

  const onTime = tasks.filter(
    (task) =>
      VALIDATED.has(task.status) &&
      task.deadline &&
      dateMs(task.validatedAt || task.completedAt) <= dateMs(task.deadline)
  ).length;

  const firstPass = tasks.filter(
    (task) =>
      VALIDATED.has(task.status) &&
      toNumber(task.rejectionCount) === 0
  ).length;

  const effortAssigned = tasks.reduce(
    (sum, task) => sum + taskEstimate(task),
    0
  );

  const effortValidated = tasks.reduce(
    (sum, task) =>
      sum + (VALIDATED.has(task.status) ? taskEstimate(task) : 0),
    0
  );

  const open = tasks.filter((task) =>
    ['TODO', 'IN_PROGRESS', 'SUBMITTED', 'IN_VALIDATION', 'REJECTED', 'CORRECTION', 'REVIEW'].includes(task.status)
  ).length;

  return {
    total,
    validated,
    submitted,
    rejected,
    blocked,
    overdue,
    open,
    validationRate: submitted ? Math.round((validated / submitted) * 100) : 0,
    firstPassRate: validated ? Math.round((firstPass / validated) * 100) : 0,
    onTimeRate: validated ? Math.round((onTime / validated) * 100) : 0,
    effortAssigned: Math.round(effortAssigned * 100) / 100,
    effortValidated: Math.round(effortValidated * 100) / 100,
    effortRate: effortAssigned
      ? Math.round((effortValidated / effortAssigned) * 100)
      : 0,
  };
}

function buildMemberName(user) {
  const fullName = [user.prenom, user.nom]
    .filter(Boolean)
    .join(' ')
    .trim();

  return user.name || fullName || user.email || user.matricule || user.uid;
}

function normalizeMemberIds(team) {
  return [
    ...new Set(
      [
        ...(Array.isArray(team.memberIds) ? team.memberIds : []),
        ...(team.leaderId ? [team.leaderId] : []),
      ]
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ];
}

export async function createTeamService(user, payload) {
  if (!user.companyId) {
    throw Object.assign(new Error('Créez d’abord votre entreprise'), { status: 400 });
  }

  if (!['SUPER_ADMIN', 'ADMIN'].includes(String(user.role || '').toUpperCase())) {
    throw Object.assign(new Error('Seuls les administrateurs peuvent créer une équipe'), { status: 403 });
  }

  const name = String(payload.name || '').trim();
  const requestedLeaderId = payload.leaderId ? String(payload.leaderId).trim() : null;
  const department = normalizeDepartment(payload.department);

  // Seul le SUPER_ADMIN peut désigner le responsable d'une équipe.
  // Le responsable devient automatiquement MANAGER.
  if (requestedLeaderId && user.role !== 'SUPER_ADMIN') {
    throw Object.assign(
      new Error('Seul le SUPER_ADMIN peut choisir le responsable d’une équipe'),
      { status: 403 }
    );
  }

  const leaderId = requestedLeaderId;

  const memberIds = [
    ...new Set(
      (Array.isArray(payload.memberIds) ? payload.memberIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ];

  if (!name) {
    throw Object.assign(new Error('Nom d’équipe requis'), { status: 400 });
  }

  const idsToValidate = [
    ...new Set([...(leaderId ? [leaderId] : []), ...memberIds]),
  ];

  if (idsToValidate.length) {
    const members = await Promise.all(
      idsToValidate.map((memberId) =>
        db.collection('users').doc(memberId).get()
      )
    );

    const invalid = members.find(
      (member) =>
        !member.exists ||
        member.data().companyId !== user.companyId
    );

    if (invalid) {
      throw Object.assign(
        new Error('Un membre sélectionné n’appartient pas à votre entreprise'),
        { status: 400 }
      );
    }
  }

  const now = new Date().toISOString();

  const team = {
    name,
    department,
    companyId: user.companyId,
    leaderId,
    memberIds: normalizeMemberIds({ memberIds, leaderId }),
    createdBy: user.uid,
    createdAt: now,
    updatedAt: now,
  };

  const batch = db.batch();
  const ref = db.collection('teams').doc();
  batch.set(ref, team);

  // Le responsable choisi devient immédiatement MANAGER.
  if (leaderId) {
    const leaderRef = db.collection('users').doc(leaderId);
    batch.update(leaderRef, {
      role: 'MANAGER',
      updatedAt: now,
    });
  }

  await batch.commit();

  // IMPORTANT :
  // l'identifiant officiel est toujours l'ID Firestore du document.
  // On ne stocke plus "id: null" dans le document.
  return {
    id: ref.id,
    ...team,
  };
}

export async function listTeamsService(user) {
  if (!user.companyId) {
    return [];
  }

  let query = db
    .collection('teams')
    .where('companyId', '==', user.companyId);

  if (user.role === 'EMPLOYEE') {
    query = db
      .collection('teams')
      .where('companyId', '==', user.companyId)
      .where('memberIds', 'array-contains', user.uid);
  }

  const snap = await query.get();

  // Un MANAGER ne doit voir/gérer que les équipes dont il est
  // effectivement le responsable.
  if (user.role === 'MANAGER') {
    return snap.docs
      .map((doc) => ({
        ...doc.data(),
        id: doc.id,
      }))
      .filter((team) => String(team.leaderId || team.managerId || '') === String(user.uid));
  }

  // IMPORTANT :
  // "id" doit être écrit APRÈS doc.data().
  // Certains anciens documents contiennent encore id:null.
  return snap.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  }));
}

export async function getTeamKpisService(user, teamId) {
  if (!user.companyId) {
    throw Object.assign(new Error('Aucune entreprise associée'), { status: 400 });
  }

  const teamSnap = await db.collection('teams').doc(String(teamId)).get();

  if (
    !teamSnap.exists ||
    teamSnap.data().companyId !== user.companyId
  ) {
    throw Object.assign(new Error('Équipe introuvable ou accès refusé'), {
      status: 404,
    });
  }

  const team = {
    ...teamSnap.data(),
    id: teamSnap.id,
  };

  if (user.role === 'MANAGER' && String(team.leaderId || team.managerId || '') !== String(user.uid)) {
    throw Object.assign(new Error('Accès refusé à cette équipe'), { status: 403 });
  }

  if (
    user.role === 'EMPLOYEE' &&
    !normalizeMemberIds(team).includes(user.uid)
  ) {
    throw Object.assign(new Error('Accès refusé à cette équipe'), {
      status: 403,
    });
  }

  const [usersSnap, tasksSnap] = await Promise.all([
    db
      .collection('users')
      .where('companyId', '==', user.companyId)
      .get(),
    db
      .collection('tasks')
      .where('companyId', '==', user.companyId)
      .get(),
  ]);

  const users = usersSnap.docs.map((doc) => ({
    ...doc.data(),
    uid: doc.id,
  }));

  const tasks = tasksSnap.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  }));

  const memberIds = normalizeMemberIds(team);

  const members = users
    .filter((member) => memberIds.includes(member.uid))
    .map((member) => {
      const memberTasks = tasks.filter((task) => {
        if (task.assigneeId !== member.uid) {
          return false;
        }

        // Les nouvelles tâches portent teamId.
        // Pour les anciennes tâches sans teamId, on utilise
        // le teamId du profil lorsqu'il existe.
        const taskTeamId = task.teamId || member.teamId || null;

        return taskTeamId === team.id;
      });

      return {
        uid: member.uid,
        name: buildMemberName(member),
        email: member.email || null,
        role: member.role || 'EMPLOYEE',
        position: member.position || '',
        department: member.department || team.department || '',
        photoURL: member.photoURL || null,
        kpis: calculateMemberKpis(memberTasks),
      };
    });

  const teamTasks = tasks.filter((task) => {
    const taskTeamId = task.teamId || null;
    return taskTeamId === team.id;
  });

  return {
    generatedAt: new Date().toISOString(),
    team: {
      id: team.id,
      name: team.name,
      department: team.department || '',
      leaderId: team.leaderId || null,
      memberCount: members.length,
    },
    summary: calculateMemberKpis(teamTasks),
    members,
  };
}

export async function getCompanyTeamsKpisService(user) {
  if (!user.companyId) {
    throw Object.assign(new Error('Aucune entreprise associée'), { status: 400 });
  }

  const teamsSnap = await db
    .collection('teams')
    .where('companyId', '==', user.companyId)
    .get();

  const teams = teamsSnap.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
  }));

  if (user.role === 'EMPLOYEE') {
    return Promise.all(
      teams
        .filter((team) => normalizeMemberIds(team).includes(user.uid))
        .map((team) => getTeamKpisService(user, team.id))
    );
  }

  if (user.role === 'MANAGER') {
    return Promise.all(
      teams
        .filter((team) => String(team.leaderId || '') === String(user.uid))
        .map((team) => getTeamKpisService(user, team.id))
    );
  }

  return Promise.all(
    teams.map((team) => getTeamKpisService(user, team.id))
  );
}

/**
 * Change le rôle d'un membre d'équipe.
 *
 * Règle métier :
 * - seul le SUPER_ADMIN peut modifier manuellement le rôle depuis l'interface équipe ;
 * - le responsable (leader) d'une équipe doit toujours être MANAGER ;
 * - on ne peut pas rétrograder le responsable actuel sans d'abord changer le responsable ;
 * - si un ancien responsable ne dirige plus aucune équipe, il peut revenir à EMPLOYEE.
 */
export async function updateTeamMemberRoleService(user, teamId, memberId, requestedRole) {
  if (!user.companyId) {
    throw Object.assign(new Error('Aucune entreprise associée'), { status: 400 });
  }

  if (user.role !== 'SUPER_ADMIN') {
    throw Object.assign(
      new Error('Seul le SUPER_ADMIN peut modifier le statut d’un membre'),
      { status: 403 }
    );
  }

  const normalizedTeamId = String(teamId || '').trim();
  const normalizedMemberId = String(memberId || '').trim();
  const role = String(requestedRole || '').trim().toUpperCase();

  if (!normalizedTeamId || !normalizedMemberId) {
    throw Object.assign(new Error('Équipe et membre requis'), { status: 400 });
  }

  if (!['EMPLOYEE', 'MANAGER'].includes(role)) {
    throw Object.assign(
      new Error('Le statut doit être EMPLOYEE ou MANAGER'),
      { status: 400 }
    );
  }

  const [teamSnap, memberSnap] = await Promise.all([
    db.collection('teams').doc(normalizedTeamId).get(),
    db.collection('users').doc(normalizedMemberId).get(),
  ]);

  if (!teamSnap.exists || teamSnap.data().companyId !== user.companyId) {
    throw Object.assign(new Error('Équipe introuvable'), { status: 404 });
  }

  if (!memberSnap.exists || memberSnap.data().companyId !== user.companyId) {
    throw Object.assign(new Error('Membre introuvable ou hors entreprise'), { status: 404 });
  }

  const team = { ...teamSnap.data(), id: teamSnap.id };

  const memberIds = normalizeMemberIds(team);
  if (!memberIds.includes(normalizedMemberId)) {
    throw Object.assign(
      new Error('Ce membre ne fait pas partie de cette équipe'),
      { status: 400 }
    );
  }

  if (team.leaderId === normalizedMemberId && role !== 'MANAGER') {
    throw Object.assign(
      new Error('Le responsable de l’équipe doit rester MANAGER. Désignez d’abord un autre responsable.'),
      { status: 400 }
    );
  }

  const memberRef = db.collection('users').doc(normalizedMemberId);
  const now = new Date().toISOString();

  await memberRef.update({
    role,
    updatedAt: now,
  });

  return {
    teamId: normalizedTeamId,
    memberId: normalizedMemberId,
    role,
    leader: team.leaderId === normalizedMemberId,
    updatedAt: now,
  };
}

/**
 * Change le responsable d'une équipe.
 *
 * Cette opération est utile au SUPER_ADMIN : le nouveau responsable
 * devient automatiquement MANAGER. L'ancien responsable est rétrogradé
 * uniquement s'il ne dirige plus aucune autre équipe.
 */
export async function updateTeamLeaderService(user, teamId, leaderId) {
  if (!user.companyId) {
    throw Object.assign(new Error('Aucune entreprise associée'), { status: 400 });
  }

  if (user.role !== 'SUPER_ADMIN') {
    throw Object.assign(
      new Error('Seul le SUPER_ADMIN peut modifier le responsable d’une équipe'),
      { status: 403 }
    );
  }

  const normalizedTeamId = String(teamId || '').trim();
  const normalizedLeaderId = String(leaderId || '').trim();

  if (!normalizedTeamId || !normalizedLeaderId) {
    throw Object.assign(new Error('Équipe et responsable requis'), { status: 400 });
  }

  const [teamSnap, leaderSnap] = await Promise.all([
    db.collection('teams').doc(normalizedTeamId).get(),
    db.collection('users').doc(normalizedLeaderId).get(),
  ]);

  if (!teamSnap.exists || teamSnap.data().companyId !== user.companyId) {
    throw Object.assign(new Error('Équipe introuvable'), { status: 404 });
  }

  if (!leaderSnap.exists || leaderSnap.data().companyId !== user.companyId) {
    throw Object.assign(new Error('Responsable introuvable ou hors entreprise'), { status: 404 });
  }

  const team = { ...teamSnap.data(), id: teamSnap.id };
  const memberIds = normalizeMemberIds(team);

  if (!memberIds.includes(normalizedLeaderId)) {
    throw Object.assign(
      new Error('Le responsable doit être membre de l’équipe'),
      { status: 400 }
    );
  }

  const oldLeaderId = team.leaderId ? String(team.leaderId) : null;
  const now = new Date().toISOString();

  const batch = db.batch();

  batch.update(teamSnap.ref, {
    leaderId: normalizedLeaderId,
    memberIds,
    updatedAt: now,
  });

  batch.update(leaderSnap.ref, {
    role: 'MANAGER',
    updatedAt: now,
  });

  if (oldLeaderId && oldLeaderId !== normalizedLeaderId) {
    const otherLeaderTeams = await db
      .collection('teams')
      .where('companyId', '==', user.companyId)
      .where('leaderId', '==', oldLeaderId)
      .get();

    if (otherLeaderTeams.empty) {
      const oldLeaderRef = db.collection('users').doc(oldLeaderId);
      batch.update(oldLeaderRef, {
        role: 'EMPLOYEE',
        updatedAt: now,
      });
    }
  }

  // Les relations projet-équipe déjà existantes doivent suivre le nouveau
  // manager. Sinon l'ancien manager resterait responsable des projets.
  const projectTeamsSnap = await db
    .collection('projectTeams')
    .where('companyId', '==', user.companyId)
    .where('teamId', '==', normalizedTeamId)
    .get();

  for (const projectTeamDoc of projectTeamsSnap.docs) {
    const relation = projectTeamDoc.data();
    const memberIds = normalizeMemberIds({
      memberIds: relation.memberIds || team.memberIds,
      leaderId: normalizedLeaderId,
    });

    batch.update(projectTeamDoc.ref, {
      managerId: normalizedLeaderId,
      memberIds,
      updatedAt: now,
    });
  }

  await batch.commit();

  return {
    id: normalizedTeamId,
    leaderId: normalizedLeaderId,
    memberIds,
    updatedAt: now,
  };
}

