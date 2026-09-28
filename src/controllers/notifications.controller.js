import { listNotificationsService, markAllNotificationsReadService, markNotificationReadService } from "../services/notification.service.js";
export async function listNotifications(req,res,next){try{res.json({success:true,data:await listNotificationsService(req.user,req.query.limit)});}catch(e){next(e)}}
export async function markNotificationRead(req,res,next){try{res.json({success:true,data:await markNotificationReadService(req.user,req.params.id)});}catch(e){next(e)}}
export async function markAllNotificationsRead(req,res,next){try{res.json({success:true,data:await markAllNotificationsReadService(req.user)});}catch(e){next(e)}}
