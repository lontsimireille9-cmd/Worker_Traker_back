import { auth, db } from "../config/firebase.js";

function getBearerToken(req) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice(7).trim();

  return token || null;
}

function isFirestorePermissionError(error) {
  return (
    error?.code === 7 ||
    error?.code === "permission-denied" ||
    error?.code === "PERMISSION_DENIED"
  );
}

function isFirestoreUnavailableError(error) {
  return (
    error?.code === 14 ||
    error?.code === "unavailable" ||
    error?.code === "UNAVAILABLE"
  );
}

/**
 * Vérifie uniquement le token Firebase.
 *
 * Utilisé lorsqu'une route doit savoir si l'utilisateur
 * est authentifié, sans avoir besoin de charger son profil Firestore.
 */
export async function requireFirebaseAuth(req, res, next) {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({
      error: "Authentification requise",
      code: "AUTH_REQUIRED",
    });
  }

  try {
    const decoded = await auth.verifyIdToken(token);

    req.firebaseUser = {
      uid: decoded.uid,
      email: decoded.email || null,
      name:
        decoded.name ||
        decoded.email?.split("@")[0] ||
        "Utilisateur",
    };

    next();
  } catch (error) {
    console.error("Firebase authentication error:", error);

    return res.status(401).json({
      error: "Session Firebase invalide ou expirée",
      code: "INVALID_FIREBASE_SESSION",
    });
  }
}

/**
 * Vérifie le token Firebase ET charge le profil
 * Daily Life depuis Firestore.
 */
export async function requireAuth(req, res, next) {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({
      error: "Authentification requise",
      code: "AUTH_REQUIRED",
    });
  }

  let decoded;

  // 1. Vérification Firebase Authentication
  try {
    decoded = await auth.verifyIdToken(token);
  } catch (error) {
    console.error("Firebase token verification error:", error);

    return res.status(401).json({
      error: "Session Firebase invalide ou expirée",
      code: "INVALID_FIREBASE_SESSION",
    });
  }

  req.firebaseUser = {
    uid: decoded.uid,
    email: decoded.email || null,
    name:
      decoded.name ||
      decoded.email?.split("@")[0] ||
      "Utilisateur",
  };

  // 2. Récupération du profil Firestore
  try {
    const snapshot = await db
      .collection("users")
      .doc(decoded.uid)
      .get();

    if (!snapshot.exists) {
      return res.status(404).json({
        error: "Profil utilisateur introuvable",
        code: "PROFILE_NOT_FOUND",
      });
    }

    req.user = {
      uid: decoded.uid,
      ...snapshot.data(),
    };

    next();
  } catch (error) {
    console.error("Firestore authorization error:", error);

    if (isFirestorePermissionError(error)) {
      return res.status(503).json({
        error:
          "Le compte de service Firebase n'a pas les droits Firestore.",
        code: "FIRESTORE_PERMISSION_DENIED",
        details:
          "Ajoute le rôle Cloud Datastore User (roles/datastore.user) " +
          "au compte de service utilisé par backend/.env.",
      });
    }

    if (isFirestoreUnavailableError(error)) {
      return res.status(503).json({
        error: "Firestore est momentanément inaccessible.",
        code: "FIRESTORE_UNAVAILABLE",
      });
    }

    return res.status(503).json({
      error: "Impossible d'accéder au profil Firestore.",
      code: "FIRESTORE_ERROR",
    });
  }
}