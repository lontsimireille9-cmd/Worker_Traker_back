import { createCompanyRecord, findCompanyById, updateCompanyRecord, findUsersByCompany, updateUserProfile } from '../repositories/user.repository.js';
import { db } from '../config/firebase.js';
import { ROLES } from '../constants/roles.js';

export async function createCompanyService(user, payload) {
  if (user.companyId) {
    throw Object.assign(new Error('Ce compte est déjà rattaché à une entreprise'), { status: 409 });
  }

  const name = String(payload.name || '').trim();
  if (!name) {
    throw Object.assign(new Error('Nom de l entreprise requis'), { status: 400 });
  }

  const now = new Date();
  const company = await createCompanyRecord({
    name,
    address: String(payload.address || '').trim(),
    country: String(payload.country || '').trim(),
    phone: String(payload.phone || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    ownerId: user.uid,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  await updateCompanyRecord(company.id, { ownerId: user.uid });
  await updateUserProfile(user.uid, { companyId: company.id, role: ROLES.SUPER_ADMIN, updatedAt: now });
  await db.collection('teams').add({
    name: 'Direction',
    companyId: company.id,
    department: 'Direction',
    leaderId: user.uid,
    memberIds: [user.uid],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  return { ...company, companyId: company.id };
}

export async function getCompanyByIdService(companyId) {
  const company = await findCompanyById(companyId);
  if (!company) {
    throw Object.assign(new Error('Entreprise introuvable'), { status: 404 });
  }
  return company;
}

export async function listCompanyEmployeesService(companyId) {
  return findUsersByCompany(companyId);
}
