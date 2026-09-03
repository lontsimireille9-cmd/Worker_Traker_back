import { db } from '../config/firebase.js';
import { ROLES } from '../constants/roles.js';

export async function createTeamService(user, payload) {
  if (!user.companyId) {
    throw Object.assign(new Error('Créez d’abord votre entreprise'), { status: 400 });
  }

  if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
    throw Object.assign(new Error('Accès refusé'), { status: 403 });
  }

  const name = String(payload.name || '').trim();
  const leaderId = payload.leaderId ? String(payload.leaderId) : null;
  const department = String(payload.department || '').trim();
  const memberIds = [...new Set(Array.isArray(payload.memberIds) ? payload.memberIds.map((id) => String(id).trim()).filter(Boolean) : [])];

  if (!name) {
    throw Object.assign(new Error('Nom d’équipe requis'), { status: 400 });
  }

  if (memberIds.length) {
    const members = await Promise.all(memberIds.map((memberId) => db.collection('users').doc(memberId).get()));
    if (members.some((member) => !member.exists || member.data().companyId !== user.companyId)) {
      throw Object.assign(new Error('Un membre sélectionné n appartient pas à votre entreprise'), { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const team = {
    id: null,
    name,
    department,
    companyId: user.companyId,
    leaderId,
    memberIds,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await db.collection('teams').add(team);
  return { id: ref.id, ...team, id: ref.id };
}

export async function listTeamsService(user) {
  if (!user.companyId) {
    return [];
  }

  let query = db.collection('teams').where('companyId', '==', user.companyId);
  if (user.role === 'EMPLOYEE') {
    query = db.collection('teams').where('memberIds', 'array-contains', user.uid);
  }

  const snap = await query.get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
