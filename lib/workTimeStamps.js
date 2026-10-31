// Stamping history for a single accumulated work-time entry. All numeric
// durations use the existing round-to-minute policy, without changing wages.
export const clockMinutes=(start,end)=>{
 const a=new Date(start).getTime(),b=new Date(end).getTime();
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<a||b-a>48*3600000)return null;
 return Math.max(1,Math.round((b-a)/60000));
};
export const workStamp=(start,end)=>{
 const minutes=clockMinutes(start,end);
 if(minutes===null)return null;
 return {startedAt:new Date(start).toISOString(),endedAt:new Date(end).toISOString(),minutes};
};
export const legacyStamp=(minutes)=>({startedAt:null,endedAt:null,minutes,historical:true});
export function storedWorkStamps(entry){
 if(Array.isArray(entry?.work_sessions)&&entry.work_sessions.length)return entry.work_sessions;
 if(Array.isArray(entry?.sessions)&&entry.sessions.length)return entry.sessions;
 const total=Number(entry?.duration_minutes??entry?.durationMinutes)||0;
 const start=entry?.started_at??entry?.startedAt,end=entry?.ended_at??entry?.endedAt;
 if(total<=0)return [];
 const stamped=start&&end?workStamp(start,end):null;
 if(!stamped)return [legacyStamp(total)];
 const known=Math.min(total,stamped.minutes);
 const current={...stamped,minutes:known};
 return total>known?[legacyStamp(total-known),current]:[current];
}
export function normalizeStampEdit(raw,original){
 if(!Array.isArray(raw)||!raw.length||raw.length>100)return {error:"Registreringen må ha minst én stempling, maksimalt 100."};
 const previous=storedWorkStamps(original);
 const legacy=previous.filter(x=>x.historical===true||!x.startedAt||!x.endedAt);
 const oldTotal=legacy.reduce((sum,x)=>sum+Number(x.minutes||0),0);
 const incomingLegacy=raw.filter(x=>x?.historical===true||!x?.startedAt||!x?.endedAt);
 if(incomingLegacy.length!==legacy.length||
  incomingLegacy.some((x,i)=>Number(x.minutes)!==Number(legacy[i].minutes)||
   x.startedAt!==null||x.endedAt!==null))
  return {error:"Historiske timer uten kjent stempling kan ikke endres i stemplingslisten."};
 const periods=[];
 for(const x of raw.slice(legacy.length)){
  if(x?.historical||!x?.startedAt||!x?.endedAt)
   return {error:"Velg både inn- og utstempling for alle arbeidsøktene."};
  const stamp=workStamp(x.startedAt,x.endedAt);
  if(!stamp)return {error:"Kontroller klokkeslettene. Utsjekk må være etter innsjekk og innen 48 timer."};
  periods.push(stamp);
 }
 if(!periods.length&&oldTotal===0)return {error:"Det må være minst én arbeidsøkt."};
 periods.sort((a,b)=>a.startedAt.localeCompare(b.startedAt));
 for(let i=1;i<periods.length;i++)
  if(Date.parse(periods[i].startedAt)<Date.parse(periods[i-1].endedAt))
   return {error:"Stemplingene overlapper. Rett klokkeslettene før lagring."};
 const stamps=[...legacy.map(x=>legacyStamp(Number(x.minutes))),...periods];
 const minutes=stamps.reduce((sum,x)=>sum+x.minutes,0);
 if(minutes<1||minutes>100000)return {error:"Samlet tid må være mellom 1 og 100 000 minutter."};
 return {stamps,minutes};
}
export function totalStampedMinutes(stamps){
 return (Array.isArray(stamps)?stamps:[]).reduce((sum,x)=>sum+Number(x.minutes||0),0);
}
