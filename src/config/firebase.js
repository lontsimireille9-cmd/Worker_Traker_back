import "dotenv/config";
import admin from "firebase-admin";
import crypto from "node:crypto";

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !rawPrivateKey) {
  throw new Error(
    "Variables Firebase manquantes dans backend/.env. " +
      "Vérifie FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY."
  );
}

const privateKey = rawPrivateKey
  .trim()
  .replace(/^['"]|['"]$/g, "")
  .replace(/\\r\\n/g, "\\n")
  .replace(/\\n/g, "\n")
  .replace(/\r/g, "");

try {
  crypto.createPrivateKey(privateKey);
} catch {
  throw new Error(
    "FIREBASE_PRIVATE_KEY invalide. " +
      "Copie exactement la valeur private_key du JSON du compte de service " +
      "et conserve les \\n."
  );
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export const auth = admin.auth();

export const db = admin.firestore();

// Utilise REST plutôt que gRPC.
// Cela évite les problèmes de connexion gRPC que tu avais précédemment.

export default admin;