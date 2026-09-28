import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "../controllers/notifications.controller.js";
const router=Router(); router.use(requireAuth); router.get("/",listNotifications); router.post("/read-all",markAllNotificationsRead); router.post("/:id/read",markNotificationRead); export default router;
