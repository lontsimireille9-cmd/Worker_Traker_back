import {generateForUser,readChecklist,completeItem} from '../services/checklist.service.js';import {getLocalDate} from '../utils/date.js';
export async function today(req,res){res.json(await readChecklist(req.user.uid,getLocalDate()))}
export async function byDate(req,res){if(!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date))return res.status(400).json({error:'Date invalide'});res.json(await readChecklist(req.user.uid,req.params.date))}
export async function complete(req,res){const r=await completeItem(req.user.uid,req.params.date,req.params.itemId);res.status(r.status).json(r.status===200?r.data:{error:r.error})}
