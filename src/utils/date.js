const TZ=()=>process.env.DEFAULT_TIME_ZONE||'Africa/Douala';
export function parts(date=new Date()){const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ(),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);return Object.fromEntries(p.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));}
export function getLocalDate(date=new Date()){const p=parts(date);return `${p.year}-${p.month}-${p.day}`}
export function getLocalTime(date=new Date()){const p=parts(date);return `${p.hour}:${p.minute}`}
export function getDayName(date=new Date()){return new Intl.DateTimeFormat('en-US',{timeZone:TZ(),weekday:'long'}).format(date).toUpperCase()}
export function addDays(dateKey,n){const d=new Date(`${dateKey}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function isExpired(date,time,now=new Date()){const today=getLocalDate(now),clock=getLocalTime(now);return date<today||(date===today&&clock>time)}
export function isBeforeStart(date,time,now=new Date()){const today=getLocalDate(now),clock=getLocalTime(now);return date>today||(date===today&&clock<time)}
