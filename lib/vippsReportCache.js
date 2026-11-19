// Pure helpers for incremental, read-only Vipps report synchronization.
// Cached reports are NOT accounting entries and do not imply Tripletex posting.
const DAY_MS=86400000;
const validDate=d=>typeof d==="string"&&/^20\d\d-\d\d-\d\d$/.test(d)&&
 Number.isFinite(Date.parse(d+"T00:00:00Z"))&&
 new Date(d+"T00:00:00Z").toISOString().slice(0,10)===d;

export function dayBefore(day,count=1){
 if(!validDate(day)||!Number.isInteger(count)||count<0||count>366)return null;
 return new Date(Date.parse(day+"T00:00:00Z")-count*DAY_MS)
  .toISOString().slice(0,10);
}

export function cacheDaysToSync(days,storedRows,yesterday,nowIso,{
 recentDays=14,minRefreshMinutes=5}={}){
 if(!Array.isArray(days)||!Array.isArray(storedRows)||!validDate(yesterday)||
  !Number.isFinite(Date.parse(nowIso))||
  !Number.isInteger(recentDays)||recentDays<1||recentDays>60||
  !Number.isInteger(minRefreshMinutes)||minRefreshMinutes<0)
  throw Error("Ugyldig periode for Vipps-kontroll.");
 const dates=new Map();
 for(const row of storedRows){
  if(!validDate(row?.report_date)||dates.has(row.report_date))
   throw Error("Lagrede Vipps-rapportdager er ikke entydige.");
  dates.set(row.report_date,row);
 }
 const newestWindow=dayBefore(yesterday,recentDays-1);
 const cutOff=Date.parse(nowIso)-minRefreshMinutes*60000;
 return days.filter(day=>{
  if(!validDate(day)||day>yesterday)
   throw Error("Vipps-perioden inneholder en fremtidig eller ugyldig dato.");
  const stored=dates.get(day);
  if(!stored)return true; // first import or a gap, regardless of age
  if(day<newestWindow)return false; // historical completed day: use saved report
  const stamp=Date.parse(stored.checked_at||"");
  return !Number.isFinite(stamp)||stamp<cutOff;
 });
}

export function chunkVippsDays(days,size=7){
 if(!Array.isArray(days)||!Number.isInteger(size)||size<1||size>7||
  days.some((d,i)=>!validDate(d)||(i>0&&days[i-1]>=d)))
  throw Error("Ugyldig Vipps-datoliste.");
 const chunks=[];
 for(let i=0;i<days.length;i+=size)chunks.push(days.slice(i,i+size));
 return chunks;
}

export function cacheDailyComparison(existing,fetched){
 const old=new Map(existing.map(x=>[x.report_date,x]));
 const stats={newDays:0,changedDays:0,unchangedDays:0};
 for(const row of fetched){
  const prior=old.get(row.report_date);
  if(!prior)stats.newDays++;
  else if(prior.fingerprint!==row.fingerprint)stats.changedDays++;
  else stats.unchangedDays++;
 }
 return stats;
}
