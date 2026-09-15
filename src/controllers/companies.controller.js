import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { auth, db } from "../config/firebase.js";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return { hash: scryptSync(password, salt, 64).toString("hex"), salt };
}

function verifyPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

function canSeeCompany(user, company) {
  return user.role === "SUPER_ADMIN"
    || company.ownerUid === user.uid
    || company.ownerId === user.uid
    || user.companyId === company.id;
}

export async function listCompanies(req, res, next) {
  try {
    let snapshot;
    if (req.user.role === "SUPER_ADMIN") {
      snapshot = await db.collection("companies").get();
    } else if (req.user.role === "ADMIN") {
      const owned = await db.collection("companies").where("ownerId", "==", req.user.uid).get();
      const legacy = await db.collection("companies").where("ownerUid", "==", req.user.uid).get();
      const docs = new Map([...owned.docs, ...legacy.docs].map((doc) => [doc.id, doc]));
      snapshot = { docs: [...docs.values()] };
    } else if (req.user.companyId) {
      const company = await db.collection("companies").doc(req.user.companyId).get();
      snapshot = { docs: company.exists ? [company] : [] };
    } else {
      return res.json([]);
    }

    const companies = snapshot.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, name: data.name || "Entreprise", status: data.status || "ACTIVE", ownerId: data.ownerId || data.ownerUid || null, authEmail: data.authEmail || null, createdAt: data.createdAt || null };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return res.json(companies);
  } catch (error) {
    next(error);
  }
}

export async function createCompany(req, res, next) {
  try {
    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) return res.status(403).json({ error: "Accès réservé à l'administrateur" });
    const name = String(req.body?.name || "").trim();
    const password = String(req.body?.password || "");
    if (name.length < 2) return res.status(400).json({ error: "Le nom de l'entreprise est requis" });
    if (password.length < 8) return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères" });

    const now = new Date().toISOString();
    const ref = db.collection("companies").doc();
    const authEmail = `company.${ref.id}@worker-tracker.local`;
    let companyAuthUser;
    try {
      companyAuthUser = await auth.createUser({ email: authEmail, password, displayName: name, emailVerified: true });
      await ref.set({ name, status: "ACTIVE", ownerId: req.user.uid, ownerUid: req.user.uid, authUid: companyAuthUser.uid, authEmail, settings: {}, createdAt: now, updatedAt: now });
    } catch (error) {
      if (companyAuthUser?.uid) await auth.deleteUser(companyAuthUser.uid).catch(() => {});
      await ref.delete().catch(() => {});
      throw error;
    }
    return res.status(201).json({ id: ref.id, name, status: "ACTIVE", ownerId: req.user.uid, authUid: companyAuthUser.uid, authEmail, createdAt: now });
  } catch (error) {
    next(error);
  }
}

export async function unlockCompany(req, res, next) {
  try {
    const companySnap = await db.collection("companies").doc(req.params.id).get();
    if (!companySnap.exists) return res.status(404).json({ error: "Entreprise introuvable" });
    const company = { id: companySnap.id, ...companySnap.data() };
    if (!canSeeCompany(req.user, company)) return res.status(403).json({ error: "Vous n'avez pas accès à cette entreprise" });
    if (company.status === "DISABLED") return res.status(403).json({ error: "Cette entreprise est désactivée" });
    const employeeAccess = req.user.role === "EMPLOYEE" && req.user.companyId === company.id;
    const companyToken = req.headers["x-company-auth"];
    let firebaseCompanyAccess = false;
    if (companyToken && company.authUid) {
      try {
        const decoded = await auth.verifyIdToken(String(companyToken));
        firebaseCompanyAccess = decoded.uid === company.authUid;
      } catch {
        firebaseCompanyAccess = false;
      }
    }
    const legacyAccess = !company.authUid && verifyPassword(String(req.body?.password || ""), company.accessPasswordHash, company.accessPasswordSalt);
    if (!employeeAccess && !firebaseCompanyAccess && !legacyAccess) return res.status(401).json({ error: "Mot de passe de l'entreprise incorrect" });

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await db.collection("companySessions").doc(tokenHash).set({ userId: req.user.uid, companyId: company.id, createdAt: new Date().toISOString(), expiresAt });
    return res.json({ sessionToken: rawToken, expiresAt, company: { id: company.id, name: company.name, status: company.status } });
  } catch (error) {
    next(error);
  }
}

export async function lockCompany(req, res) {
  const token = req.headers["x-company-session"];
  if (token) await db.collection("companySessions").doc(createHash("sha256").update(String(token)).digest("hex")).delete().catch(() => {});
  return res.json({ message: "Entreprise verrouillée" });
}

export async function getCurrentCompany(req, res) {
  return res.json({ ...req.company, accessPasswordHash: undefined, accessPasswordSalt: undefined });
}

export async function updateCurrentCompany(req, res, next) {
  try {
    if (req.user.role !== "SUPER_ADMIN") return res.status(403).json({ error: "Seul le SUPER_ADMIN peut modifier le profil de l'entreprise" });
    const update = { updatedAt: new Date().toISOString() };
    if (typeof req.body?.name === "string" && req.body.name.trim()) update.name = req.body.name.trim();
    for (const key of ["address", "phone", "email", "country"]) {
      if (typeof req.body?.[key] === "string") update[key] = req.body[key].trim();
    }
    await db.collection("companies").doc(req.companyId).update(update);
    return res.json({ ...req.company, ...update, accessPasswordHash: undefined, accessPasswordSalt: undefined });
  } catch (error) {
    next(error);
  }
}
