import { admin, db } from "../config/firebase.js";

const notifications = db.collection("notifications");
const now = () => new Date().toISOString();

export async function createNotifications({ companyId, recipientIds, type, title, body, data = {} }) {
  const ids = [...new Set((recipientIds || []).map(String).filter(Boolean))];
  if (!companyId || !ids.length) return [];
  const timestamp = now(); const batch = db.batch(); const created = [];
  for (const userId of ids) { const ref = notifications.doc(); const item = { id: ref.id, companyId, userId, type, title, body, data, read: false, createdAt: timestamp, readAt: null }; batch.set(ref, item); created.push(item); }
  await batch.commit(); await sendPushNotifications(ids, title, body, data, companyId); return created;
}

async function sendPushNotifications(userIds, title, body, data, companyId) {
  try { const snap = await db.collection("users").where("companyId", "==", companyId).get(); const tokens=[];
    snap.docs.forEach(doc=>{ if(!userIds.includes(doc.id)) return; Object.keys(doc.data()?.messagingTokens || {}).forEach(t=>tokens.push(t)); });
    const unique=[...new Set(tokens)].filter(Boolean); if(!unique.length) return;
    await admin.messaging().sendEachForMulticast({ tokens: unique, notification:{ title, body:String(body||"").slice(0,180) }, data:Object.fromEntries(Object.entries({...data,type}).map(([k,v])=>[k,String(v??"")])) });
  } catch(error){ console.warn("[Notifications] Push non envoyée:",error.message); }
}

export async function listNotificationsService(user, limit=50){
  if(!user.companyId) return {notifications:[],unreadCount:0}; const safe=Math.min(Math.max(Number(limit)||50,1),100);
  const snap=await notifications.where("userId","==",user.uid).limit(safe).get();
  const items=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.companyId===user.companyId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  return {notifications:items,unreadCount:items.filter(x=>!x.read).length};
}
export async function markNotificationReadService(user,id){ const ref=notifications.doc(String(id)); const snap=await ref.get(); if(!snap.exists||snap.data().userId!==user.uid||snap.data().companyId!==user.companyId) throw Object.assign(new Error("Notification introuvable"),{status:404}); const readAt=now(); await ref.update({read:true,readAt}); return {id:ref.id,read:true,readAt}; }
export async function markAllNotificationsReadService(user){ const snap=await notifications.where("userId","==",user.uid).get(); const batch=db.batch(); const readAt=now(); let updated=0; snap.docs.forEach(doc=>{if(doc.data().companyId===user.companyId&&!doc.data().read){batch.update(doc.ref,{read:true,readAt});updated++;}}); if(updated) await batch.commit(); return {updated}; }
export async function getCompanyNotificationRecipients(companyId,roles=[]){ const snap=await db.collection("users").where("companyId","==",companyId).get(); const wanted=new Set(roles.map(r=>String(r).toUpperCase())); return snap.docs.filter(d=>!roles.length||wanted.has(String(d.data()?.role||"").toUpperCase())).map(d=>d.id); }
export async function notifyTaskAssigned({task,assigneeId,actorId}){ if(!assigneeId||String(assigneeId)===String(actorId))return; await createNotifications({companyId:task.companyId,recipientIds:[assigneeId],type:"TASK_ASSIGNED",title:"Nouvelle tâche attribuée",body:`La tâche « ${task.title} » vous a été attribuée.`,data:{taskId:task.id}}); }
export async function notifyDifficultyReported({task,reporter,note}){ const recipients=new Set(await getCompanyNotificationRecipients(task.companyId,["SUPER_ADMIN","ADMIN"])); if(task.teamId){const team=await db.collection("teams").doc(String(task.teamId)).get(); if(team.exists){const d=team.data(); if(d.leaderId)recipients.add(String(d.leaderId)); (Array.isArray(d.managerIds)?d.managerIds:[]).forEach(id=>recipients.add(String(id)));}} recipients.delete(String(reporter.uid)); await createNotifications({companyId:task.companyId,recipientIds:[...recipients],type:"TASK_DIFFICULTY",title:"Difficulté signalée sur une tâche",body:`${reporter.name||reporter.email||"Un employé"} signale une difficulté sur « ${task.title} ».${note?` ${note}`:""}`,data:{taskId:task.id}}); }
