import { Router } from "express";
import { createCompany, getCurrentCompany, listCompanies, unlockCompany, lockCompany, updateCurrentCompany } from "../controllers/companies.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { requireCompanyAccess } from "../middleware/company.middleware.js";

const router = Router();
router.get("/", requireAuth, listCompanies);
router.post("/", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), createCompany);
router.post("/:id/unlock", requireAuth, unlockCompany);
router.post("/lock", requireAuth, requireCompanyAccess, lockCompany);
router.get("/current", requireAuth, requireCompanyAccess, getCurrentCompany);
router.patch("/current", requireAuth, requireCompanyAccess, requireRole("SUPER_ADMIN"), updateCurrentCompany);
export default router;
