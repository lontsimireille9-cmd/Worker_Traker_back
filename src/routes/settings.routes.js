import { Router } from "express";
import { getSettings, updateSettings } from "../controllers/settings.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
router.get("/", requireAuth, getSettings);
router.patch("/", requireAuth, updateSettings);
export default router;
