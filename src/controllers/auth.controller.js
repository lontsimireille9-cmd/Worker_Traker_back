import { createProfile } from "../services/auth.service.js";

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

export async function register(req, res) {
  try {
    if (!req.firebaseUser) {
      return res.status(401).json({
        error: "Authentification Firebase requise",
        code: "AUTH_REQUIRED",
      });
    }

    const name = String(req.body?.name || "").trim();

    if (name.length < 2) {
      return res.status(400).json({
        error: "Le nom doit contenir au moins 2 caractères.",
        code: "INVALID_NAME",
      });
    }

    const profile = await createProfile(
      req.firebaseUser.uid,
      name,
      req.firebaseUser.email
    );

    return res.status(201).json(profile);
  } catch (error) {
    console.error("Register error:", error);

    if (isFirestorePermissionError(error)) {
      return res.status(503).json({
        error:
          "Firestore refuse l'accès au compte de service.",
        code: "FIRESTORE_PERMISSION_DENIED",
        details:
          "Vérifie le compte FIREBASE_CLIENT_EMAIL dans backend/.env " +
          "et son rôle IAM Cloud Datastore User.",
      });
    }

    if (isFirestoreUnavailableError(error)) {
      return res.status(503).json({
        error: "Firestore est momentanément inaccessible.",
        code: "FIRESTORE_UNAVAILABLE",
      });
    }

    return res.status(500).json({
      error: "Impossible de créer le profil Daily Life.",
      code: "PROFILE_CREATION_FAILED",
    });
  }
}

export function me(req, res) {
  if (!req.user) {
    return res.status(404).json({
      error: "Profil utilisateur introuvable",
      code: "PROFILE_NOT_FOUND",
    });
  }

  return res.json(req.user);
}