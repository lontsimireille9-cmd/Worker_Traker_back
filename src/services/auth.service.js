import { auth, db } from '../config/firebase.js';
import { createUserProfile, findUserById, updateUserProfile } from '../repositories/user.repository.js';
import { ROLES, isValidRole } from '../constants/roles.js';

export async function registerProfileService(payload) {
  const { uid, email, nom, prenom, telephone, role, companyId, name } = payload;

  if (!uid || !email) {
    throw Object.assign(new Error('uid et email requis'), { status: 400 });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedRole = String(role || ROLES.EMPLOYEE).trim().toUpperCase();

  if (!isValidRole(normalizedRole)) {
    throw Object.assign(new Error('Rôle invalide'), { status: 400 });
  }

  try {
    await auth.getUser(uid);
  } catch {
    throw Object.assign(new Error('Utilisateur Firebase introuvable'), { status: 404 });
  }

  const existingUser = await findUserById(uid);
  if (existingUser) {
    throw Object.assign(new Error('Profil déjà créé'), { status: 409 });
  }

  const now = new Date();
  const profile = {
    uid,
    nom: String(nom || name || '').trim(),
    prenom: String(prenom || '').trim(),
    email: normalizedEmail,
    telephone: String(telephone || '').trim(),
    role: normalizedRole,
    companyId: companyId || null,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    lastLogin: null,
    photoURL: null,
  };

  await createUserProfile(uid, profile);
  return profile;
}

export async function getMeService(uid) {
  const profile = await findUserById(uid);
  if (!profile) {
    throw Object.assign(new Error('Profil introuvable'), { status: 404 });
  }

  const fullName = [profile.prenom, profile.nom].filter(Boolean).join(' ').trim();
  return {
    ...profile,
    name: fullName || profile.email || 'Utilisateur',
    displayName: fullName || profile.email || 'Utilisateur',
  };
}

export async function resolveMatriculeService(matricule) {
  if (!matricule) {
    throw Object.assign(new Error('Matricule requis'), { status: 400 });
  }

  const normalizedMatricule = String(matricule)
    .trim()
    .toUpperCase();

  try {
    const doc = await db
      .collection('matricules')
      .doc(normalizedMatricule)
      .get();

    if (!doc.exists) {
      throw Object.assign(
        new Error(`Matricule inconnu : ${normalizedMatricule}`),
        { status: 404 }
      );
    }

    const data = doc.data();

    if (!data?.email) {
      throw Object.assign(
        new Error(`Aucun email associé au matricule ${normalizedMatricule}`),
        { status: 404 }
      );
    }

    return {
      matricule: normalizedMatricule,
      email: String(data.email).trim().toLowerCase(),
    };
  } catch (error) {
    // Conserver nos erreurs HTTP volontairement générées
    if (error?.status) {
      throw error;
    }

    console.error('[resolveMatriculeService] Erreur Firestore:', error.message);
    const unavailable = Number(error?.code) === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(`${error?.details || ''} ${error?.message || ''}`);
    throw Object.assign(
      new Error(unavailable
        ? 'Le service de connexion est temporairement indisponible. Réessayez après le rétablissement de Firebase.'
        : 'Impossible de vérifier le matricule avec Firestore'),
      { status: unavailable ? 503 : 500 }
    );
  }
}

export async function loginWithEmailPasswordService(email, password) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await auth.getUserByEmail(normalizedEmail);
  return { uid: user.uid, email: normalizedEmail };
}

export async function updateLastLoginService(uid) {
  await updateUserProfile(uid, { lastLogin: new Date(), updatedAt: new Date() });
}
