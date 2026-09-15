import { auth, db } from '../config/firebase.js';
import { findEmployeeByMatricule, saveEmployeeProfile, saveMatriculeRecord, findEmployeesByCompany } from '../repositories/employee.repository.js';
import { createUserProfile } from '../repositories/user.repository.js';
import { ROLES } from '../constants/roles.js';

function buildTechnicalEmail(matricule, companyId) {
  return `${String(matricule).trim().toLowerCase()}@${String(companyId).trim().toLowerCase()}.matricule.local`;
}

export async function createEmployeeService(user, payload) {
  const companyId = user.companyId;
  if (!companyId) {
    throw Object.assign(new Error('Créez d abord votre entreprise'), { status: 400 });
  }

  const matricule = String(payload.matricule || '').trim().toUpperCase();
  const name = String(payload.name || '').trim();
  const code = String(payload.code || '').trim();
  const role = String(payload.role || 'EMPLOYEE').trim().toUpperCase();
  const teamId = payload.teamId ? String(payload.teamId).trim() : null;
  const department = String(payload.department || '').trim();
  const position = String(payload.position || '').trim();

  if (!matricule || !name || !code) {
    throw Object.assign(new Error('Matricule, nom et code requis'), { status: 400 });
  }
  if (code.length < 6) {
    throw Object.assign(new Error('Le code doit contenir au moins 6 caractères'), { status: 400 });
  }
  if (!['EMPLOYEE', 'MANAGER'].includes(role)) {
    throw Object.assign(new Error('Rôle invalide'), { status: 400 });
  }

  const existingMatricule = await findEmployeeByMatricule(matricule);
  if (existingMatricule) {
    throw Object.assign(new Error('Ce matricule est déjà utilisé'), { status: 409 });
  }

  const email = buildTechnicalEmail(matricule, companyId);
  const authUser = await auth.createUser({
    email,
    password: code,
    displayName: name,
    emailVerified: true,
  });

  const now = new Date();
  const employeeProfile = {
    uid: authUser.uid,
    matricule,
    companyId,
    role,
    department: String(payload.department || '').trim(),
    position,
    teamId,
    department,
    hireDate: payload.hireDate || now.toISOString(),
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  await createUserProfile(authUser.uid, {
    uid: authUser.uid,
    nom: String(name).trim().split(' ')[0] || '',
    prenom: String(name).trim().split(' ').slice(1).join(' ') || '',
    email,
    telephone: '',
    role,
    companyId,
    teamId,
    department,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    lastLogin: null,
    photoURL: null,
  });

  await saveEmployeeProfile(employeeProfile);
  await saveMatriculeRecord({
    matricule,
    uid: authUser.uid,
    email,
    companyId,
    createdAt: now,
  });

  return { uid: authUser.uid, matricule, email };
}

export async function listEmployeeService(user) {
  if (!user.companyId) {
    return [];
  }

  const employees = await findEmployeesByCompany(user.companyId);
  const userSnap = await db.collection('users').where('companyId', '==', user.companyId).get();
  const userMap = Object.fromEntries(
    userSnap.docs.map((doc) => [doc.id, { uid: doc.id, ...doc.data() }])
  );

  return employees.map((employee) => {
    const profile = userMap[employee.uid] || {};
    const fullName = [profile.prenom, profile.nom].filter(Boolean).join(' ').trim();
    return {
      ...employee,
      name: fullName || profile.email || employee.matricule || employee.uid,
      email: profile.email || null,
      role: profile.role || employee.role,
      teamId: profile.teamId || employee.teamId || null,
      department: profile.department || employee.department || '',
    };
  });
}
