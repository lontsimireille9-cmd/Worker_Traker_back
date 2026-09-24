import { db } from '../config/firebase.js';
import { normalizeDepartment } from '../constants/departments.js';

const collections = ['users', 'employees', 'teams'];
const legacy = new Set(['Développement numérique', 'Developpement numerique', 'Développement numérique ', 'Développement', 'Vente', 'vente']);

let changed = 0;
for (const collection of collections) {
  const snap = await db.collection(collection).get();
  let batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    const value = doc.data()?.department;
    if (!legacy.has(String(value || '').trim())) continue;
    batch.update(doc.ref, { department: normalizeDepartment(value), updatedAt: new Date().toISOString() });
    changed += 1; count += 1;
    if (count === 450) { await batch.commit(); batch = db.batch(); count = 0; }
  }
  if (count) await batch.commit();
}
console.log(`Migration des départements terminée. ${changed} document(s) modifié(s).`);
process.exit(0);
