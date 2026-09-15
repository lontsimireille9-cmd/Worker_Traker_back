import crypto from 'crypto';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config({ override: true });

/**
 * ============================================================
 * CONFIGURATION FIREBASE ADMIN
 * ============================================================
 *
 * Variables nécessaires :
 *
 * FIREBASE_PROJECT_ID
 * FIREBASE_CLIENT_EMAIL
 * FIREBASE_PRIVATE_KEY
 *
 * Exemple :
 *
 * FIREBASE_PROJECT_ID=mon-projet
 * FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@mon-projet.iam.gserviceaccount.com
 * FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 *
 * NE JAMAIS afficher FIREBASE_PRIVATE_KEY dans les logs.
 */

// ------------------------------------------------------------
// 1. Vérification des variables d'environnement
// ------------------------------------------------------------

const REQUIRED_ENV_VARS = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
];

const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => {
  const value = process.env[key];

  return !value || String(value).trim() === '';
});

if (missingEnvVars.length > 0) {
  throw new Error(
    `[Firebase] Variables d'environnement manquantes : ${missingEnvVars.join(', ')}`
  );
}

// ------------------------------------------------------------
// 2. Récupération des variables
// ------------------------------------------------------------

const projectId = String(process.env.FIREBASE_PROJECT_ID).trim();

const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL)
  .trim()
  .replace(/^['"]|['"]$/g, '');

const rawPrivateKey = String(process.env.FIREBASE_PRIVATE_KEY);

// ------------------------------------------------------------
// 3. Normalisation de la clé privée
// ------------------------------------------------------------

function normalizePrivateKey(value) {
  let privateKey = String(value).trim();

  // Supprime les guillemets éventuellement présents
  privateKey = privateKey.replace(/^['"]|['"]$/g, '');

  // Convertit les séquences littérales \n en vrais retours à la ligne
  privateKey = privateKey.replace(/\\n/g, '\n');

  // Convertit les séquences littérales \r\n
  privateKey = privateKey.replace(/\\r\\n/g, '\n');

  // Normalise les vrais retours Windows
  privateKey = privateKey.replace(/\r\n/g, '\n');

  // Supprime les espaces inutiles autour
  privateKey = privateKey.trim();

  return privateKey;
}

const privateKey = normalizePrivateKey(rawPrivateKey);

// ------------------------------------------------------------
// 4. Validation de la clé privée
// ------------------------------------------------------------

function validatePrivateKey(key) {
  if (!key) {
    throw new Error(
      '[Firebase] FIREBASE_PRIVATE_KEY est vide.'
    );
  }

  if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error(
      '[Firebase] FIREBASE_PRIVATE_KEY ne contient pas "-----BEGIN PRIVATE KEY-----".'
    );
  }

  if (!key.includes('-----END PRIVATE KEY-----')) {
    throw new Error(
      '[Firebase] FIREBASE_PRIVATE_KEY ne contient pas "-----END PRIVATE KEY-----".'
    );
  }

  try {
    crypto.createPrivateKey({
      key,
      format: 'pem',
      type: 'pkcs8',
    });
  } catch (error) {
    throw new Error(
      `[Firebase] FIREBASE_PRIVATE_KEY invalide : ${error.message}`
    );
  }
}

validatePrivateKey(privateKey);

// ------------------------------------------------------------
// 5. Validation du projet Firebase
// ------------------------------------------------------------

if (!projectId) {
  throw new Error(
    '[Firebase] FIREBASE_PROJECT_ID est vide.'
  );
}

if (!clientEmail) {
  throw new Error(
    '[Firebase] FIREBASE_CLIENT_EMAIL est vide.'
  );
}

if (!clientEmail.includes('@')) {
  throw new Error(
    '[Firebase] FIREBASE_CLIENT_EMAIL semble invalide.'
  );
}

if (!clientEmail.endsWith('.iam.gserviceaccount.com')) {
  console.warn(
    '[Firebase] Attention : FIREBASE_CLIENT_EMAIL ne ressemble pas à un compte de service Google standard.'
  );
}

// ------------------------------------------------------------
// 6. Vérification de cohérence projectId / clientEmail
// ------------------------------------------------------------

const clientEmailParts = clientEmail.split('@');

if (clientEmailParts.length === 2) {
  const emailDomain = clientEmailParts[1];

  const expectedSuffix = `${projectId}.iam.gserviceaccount.com`;

  if (!emailDomain.endsWith(expectedSuffix)) {
    console.warn(
      '[Firebase] ATTENTION : FIREBASE_CLIENT_EMAIL ne semble pas appartenir au projet Firebase indiqué par FIREBASE_PROJECT_ID.'
    );

    console.warn(
      `[Firebase] projectId utilisé : ${projectId}`
    );

    console.warn(
      `[Firebase] clientEmail utilisé : ${clientEmail}`
    );
  }
}

// ------------------------------------------------------------
// 7. Initialisation Firebase Admin
// ------------------------------------------------------------

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

    console.log(
      `[Firebase] Firebase Admin initialisé pour le projet : ${projectId}`
    );

    console.log(
      `[Firebase] Service account : ${clientEmail}`
    );
  } catch (error) {
    console.error(
      '[Firebase] Impossible d\'initialiser Firebase Admin.'
    );

    console.error(error);

    throw error;
  }
} else {
  console.log(
    `[Firebase] Firebase Admin déjà initialisé pour le projet : ${projectId}`
  );
}

// ------------------------------------------------------------
// 8. Services Firebase
// ------------------------------------------------------------

const auth = admin.auth();
const db = admin.firestore();

// ------------------------------------------------------------
// 9. Configuration Firestore
// ------------------------------------------------------------

db.settings({
  ignoreUndefinedProperties: true,
  maxRetries: 0,
});

// ------------------------------------------------------------
// 10. Export
// ------------------------------------------------------------

export {
  auth,
  db,
  admin,
};

export default admin;
