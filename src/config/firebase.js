import crypto from 'crypto';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const requiredEnvVars = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  throw new Error(`Configuration Firebase Admin manquante: ${missingEnvVars.join(', ')}`);
}

function normalizePrivateKey(privateKey) {
  return String(privateKey)
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n');
}

function validatePrivateKey(privateKey) {
  try {
    crypto.createPrivateKey(privateKey);
    return true;
  } catch (error) {
    throw new Error(`FIREBASE_PRIVATE_KEY invalide: ${error.message}`);
  }
}

const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
validatePrivateKey(privateKey);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

const auth = admin.auth();
const db = admin.firestore();

db.settings({ ignoreUndefinedProperties: true });

export { auth, db, admin };
export default admin;
