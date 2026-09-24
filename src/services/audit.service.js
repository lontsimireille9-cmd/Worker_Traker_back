import { db } from '../config/firebase.js';

export async function audit(user, type, entity, entityId, data = {}) {
  if (!user?.companyId) return null;
  const payload = { companyId: user.companyId, actorId: user.uid, actorRole: user.role || null, type, entity, entityId: entityId || null, data, createdAt: new Date().toISOString() };
  const ref = await db.collection('auditEvents').add(payload);
  return { id: ref.id, ...payload };
}

export async function listAudit(user, filters = {}) {
  if (!user?.companyId) return [];
  const snap = await db.collection('auditEvents').where('companyId', '==', user.companyId).get();
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (filters.entity) rows = rows.filter(x => x.entity === filters.entity);
  if (filters.entityId) rows = rows.filter(x => x.entityId === filters.entityId);
  return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 500);
}
