// A paused, standalone work timer keeps its previous saved minutes.
// Only the current running segment is added when it is stopped again.
export function accruedWorkMinutes(savedMinutes,startedAt,endedAt){
 const previous=Number(savedMinutes);
 const start=new Date(startedAt).getTime(),end=new Date(endedAt).getTime();
 if(!Number.isSafeInteger(previous)||previous<0||previous>100000||
  !Number.isFinite(start)||!Number.isFinite(end)||end<start)
  return null;
 const increment=Math.max(1,Math.round((end-start)/60000));
 const combined=previous+increment;
 return combined<=100000?combined:null;
}
export function combinedWorkClockText(savedMinutes,startedAt,nowMs){
 const previous=Number(savedMinutes);
 const start=new Date(startedAt).getTime();
 const extra=Number.isFinite(start)&&Number.isFinite(nowMs)
  ?Math.max(0,Math.floor((nowMs-start)/1000)):0;
 const seconds=(Number.isSafeInteger(previous)&&previous>0?previous*60:0)+extra;
 const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;
 return [h,m,s].map(n=>String(n).padStart(2,"0")).join(":");
}
