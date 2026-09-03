import { createHash } from "node:crypto";
import { db } from "../config/firebase.js";

export async function requireCompanyAccess(req, res, next) {
  const rawToken = req.headers["x-company-session"];
  if (!rawToken || typeof rawToken !== "string") {
    return res.status(423).json({ error: "Sélectionnez une entreprise avant de continuer" });
  }

  try {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const sessionRef = db.collection("companySessions").doc(tokenHash);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) return res.status(401).json({ error: "Session d'entreprise invalide ou expirée" });

    const session = sessionSnap.data();
    if (session.userId !== req.user.uid || new Date(session.expiresAt || 0).getTime() <= Date.now()) {
      await sessionRef.delete().catch(() => {});
      return res.status(401).json({ error: "Session d'entreprise invalide ou expirée" });
    }

    const companySnap = await db.collection("companies").doc(session.companyId).get();
    if (!companySnap.exists || companySnap.data().status === "DISABLED") {
      return res.status(404).json({ error: "Entreprise indisponible" });
    }

    const company = { id: companySnap.id, ...companySnap.data() };
    const canAccess = req.user.role === "SUPER_ADMIN"
      || company.ownerUid === req.user.uid
      || company.ownerId === req.user.uid
      || req.user.companyId === company.id;
    if (!canAccess) return res.status(403).json({ error: "Vous n'avez pas accès à cette entreprise" });

    req.companyId = company.id;
    req.company = company;
    req.companySession = session;
    req.user = { ...req.user, companyId: company.id };
    return next();
  } catch (error) {
    console.error(error);
    return res.status(401).json({ error: "Impossible de valider la session d'entreprise" });
  }
}
