import { db } from '../config/firebase.js';

const employeesCollection = db.collection('employees');
const matriculesCollection = db.collection('matricules');

export async function findEmployeeByMatricule(matricule) {
  const doc = await matriculesCollection.doc(matricule).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

export async function saveEmployeeProfile(data) {
  const ref = employeesCollection.doc(data.uid);
  await ref.set(data);
  return { uid: ref.id, ...data };
}

export async function saveMatriculeRecord(data) {
  const ref = matriculesCollection.doc(data.matricule);
  await ref.set(data);
  return { id: ref.id, ...data };
}

export async function findEmployeesByCompany(companyId) {
  const snapshot = await employeesCollection.where('companyId', '==', companyId).get();
  return snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
}

export async function findEmployeeByUid(uid) {
  const doc = await employeesCollection.doc(uid).get();
  return doc.exists ? { uid: doc.id, ...doc.data() } : null;
}
