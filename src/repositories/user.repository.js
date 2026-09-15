import { db } from '../config/firebase.js';

const usersCollection = db.collection('users');
const companiesCollection = db.collection('companies');
const userCache = new Map();
const companyUsersCache = new Map();
const companyUsersPending = new Map();
const USER_CACHE_TTL = 60 * 1000;
const COMPANY_USERS_CACHE_TTL = 30 * 1000;

export async function findUserById(uid) {
  const cached = userCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  const doc = await usersCollection.doc(uid).get();
  const user = doc.exists ? { uid: doc.id, ...doc.data() } : null;
  userCache.set(uid, { user, expiresAt: Date.now() + USER_CACHE_TTL });
  return user;
}

export async function createUserProfile(uid, data) {
  await usersCollection.doc(uid).set(data, { merge: false });
  return findUserById(uid);
}

export async function updateUserProfile(uid, data) {
  await usersCollection.doc(uid).update(data);
  return findUserById(uid);
}

export async function addUserMessagingToken(uid, token) {
  await usersCollection.doc(uid).set({ messagingTokens: { [token]: true }, updatedAt: new Date() }, { merge: true });
  return findUserById(uid);
}

export async function findUsersByCompany(companyId) {
  const cached = companyUsersCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.users;
  if (companyUsersPending.has(companyId)) return companyUsersPending.get(companyId);

  const request = usersCollection.where('companyId', '==', companyId).get()
    .then((snapshot) => {
      const users = snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
      users.forEach((user) => userCache.set(user.uid, { user, expiresAt: Date.now() + USER_CACHE_TTL }));
      companyUsersCache.set(companyId, { users, expiresAt: Date.now() + COMPANY_USERS_CACHE_TTL });
      return users;
    })
    .finally(() => companyUsersPending.delete(companyId));

  companyUsersPending.set(companyId, request);
  return request;
}

export async function findCompanyById(companyId) {
  const doc = await companiesCollection.doc(companyId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

export async function createCompanyRecord(data) {
  const ref = companiesCollection.doc();
  await ref.set(data);
  return { id: ref.id, ...data };
}

export async function updateCompanyRecord(companyId, data) {
  await companiesCollection.doc(companyId).update(data);
  return findCompanyById(companyId);
}

export async function findCompanyEmployees(companyId) {
  const snapshot = await usersCollection.where('companyId', '==', companyId).get();
  return snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
}
