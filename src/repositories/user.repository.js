import { db } from '../config/firebase.js';

const usersCollection = db.collection('users');
const companiesCollection = db.collection('companies');

export async function findUserById(uid) {
  const doc = await usersCollection.doc(uid).get();
  return doc.exists ? { uid: doc.id, ...doc.data() } : null;
}

export async function createUserProfile(uid, data) {
  await usersCollection.doc(uid).set(data, { merge: false });
  return findUserById(uid);
}

export async function updateUserProfile(uid, data) {
  await usersCollection.doc(uid).update(data);
  return findUserById(uid);
}

export async function findUsersByCompany(companyId) {
  const snapshot = await usersCollection.where('companyId', '==', companyId).get();
  return snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
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
