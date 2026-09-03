import { findCompanyById, updateCompanyRecord } from '../repositories/user.repository.js';

export async function getCompanyProfileService(user) {
  if (!user.companyId) {
    throw Object.assign(new Error('Entreprise non définie'), { status: 404 });
  }
  return findCompanyById(user.companyId);
}

export async function updateCompanyProfileService(user, payload) {
  if (user.role !== 'SUPER_ADMIN') {
    throw Object.assign(new Error("Seul le SUPER_ADMIN peut modifier le profil de l'entreprise"), { status: 403 });
  }
  if (!user.companyId) {
    throw Object.assign(new Error('Entreprise non définie'), { status: 404 });
  }

  const now = new Date();
  const update = {
    name: String(payload.name || '').trim(),
    address: String(payload.address || '').trim(),
    phone: String(payload.phone || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
    updatedAt: now,
  };

  await updateCompanyRecord(user.companyId, update);
  return findCompanyById(user.companyId);
}
