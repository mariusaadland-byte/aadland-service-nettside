import "server-only";
import {db} from "./supabase";

// Only the Service workflows are monitored. The mixed Vipps receipt job
// (Service + rentals) is intentionally excluded from S-17.
export const SERVICE_CRON_JOBS=Object.freeze([
 {key:"invoice-review-alerts",label:"Daglig fakturaoppfølging",schedule:"08:00 UTC"},
 {key:"vat-deadline-reminders",label:"MVA-fristvarsler",schedule:"08:35 UTC"},
 {key:"survey-reminders",label:"Befaringspåminnelser",schedule:"09:15 UTC"},
 {key:"job-reminders",label:"Oppstartspåminnelser",schedule:"09:30 UTC"},
 {key:"quote-followups",label:"Tilbudsoppfølging",schedule:"10:00 UTC"},
 {key:"scheduled-invoices",label:"Planlagt fakturautsending",schedule:"10:20 UTC"},
 {key:"service-order-confirmations",label:"Ordrebekreftelser – kø",schedule:"10:25 UTC",firstCompleteDay:"2026-11-27"},
 {key:"quote-response-confirmations",label:"Tilbudssvar – bekreftelser",schedule:"10:40 UTC",firstCompleteDay:"2026-11-27"},
 {key:"contact-image-cleanup",label:"Opprydding av ubundne kontaktbilder",schedule:"12:50 UTC",firstCompleteDay:"2026-11-27"}
]);

// The day after this feature is deployed is used for the initial, full-day
// monitoring period. The monitoring cron runs at 14:30 UTC each day.
export const SERVICE_CRON_FIRST_COMPLETE_DAY="2026-11-23";

export function serviceCronResponseStatus(httpStatus,data){
 const status=Number(httpStatus)||500;
 if(status>=500)return {state:"failed",detail:"HTTP "+status};
 if(status>=400)return {state:"warning",detail:"HTTP "+status};
 if(status===207)return {state:"warning",detail:"Minst én arbeidsoppgave trenger gjennomgang"};
 if(data?.ok===false)return {state:"warning",detail:"API meldte manglende bekreftelse"};
 if(data?.setupRequired===true)return {state:"warning",detail:"Oppsett mangler"};
 const failed=Number(data?.failed)||0;
 const partial=Array.isArray(data?.failures)?data.failures.length:0;
 const needsReview=Array.isArray(data?.results)?data.results.filter(row=>["failed","needs_review"].includes(row?.status)).length:0;
 const notices=Number(data?.reviewNoticeFailures)||0;
 const recovered=Number(data?.recoveredForReview)||0;
 if(failed>0||partial>0||needsReview>0||notices>0||recovered>0||Number(data?.requiresReview)>0||Number(data?.review)>0)
  return {state:"warning",detail:"Minst én arbeidsoppgave trenger gjennomgang"};
 return {state:"ok",detail:"Kontrollen ble gjennomført"};
}

// Allow one hour after the UTC schedule before declaring a missing invocation.
export const SERVICE_CRON_GRACE_MS=60*60*1000;
export function serviceCronDailyStatus(job,runs=[],day=new Date().toISOString().slice(0,10),now=Date.now()){
 const matching=(runs||[]).filter(x=>x.job_key===job.key)
   .slice().sort((a,b)=>String(b.started_at||"").localeCompare(String(a.started_at||"")));
 const latest=matching[0]||null;
 const lastSuccess=matching.find(row=>row.state==="ok")||null;
 const todays=matching.filter(row=>String(row.started_at||"").slice(0,10)===day);
 let state="missing",detail="Ingen registrert kjøring etter planlagt tidspunkt og 60 minutters slingringsmonn";
 const scheduled=Date.parse(day+"T"+String(job.schedule||"").split(" ")[0]+":00.000Z");
 if(!todays.length&&day<(job.firstCompleteDay||SERVICE_CRON_FIRST_COMPLETE_DAY)){
  state="starting";detail="Venter på første hele driftsdag";
 }else if(!todays.length&&Number.isFinite(scheduled)&&now<scheduled+SERVICE_CRON_GRACE_MS){
  state="waiting";detail=now<scheduled?"Dagens kjøring er ikke planlagt ennå":"Venter på registrert kjøring innen 60 minutters slingringsmonn";
 }
 if(todays.length){
  const recent=todays[0];
  state=recent.state==="ok"?"ok":recent.state==="running"?"running":recent.state==="warning"?"warning":"failed";
  detail=recent.detail||({
   ok:"Fullført",running:"Pågår",warning:"Krever gjennomgang",failed:"Kjøring feilet"
  }[state]||"Ukjent");
  if(state==="running"&&now-Date.parse(recent.started_at)>=10*60*1000){state="warning";detail="Kjøring har ikke meldt ferdig innen 10 minutter. Kontroller loggen.";}
 }
 return {...job,state,detail,lastStartedAt:latest?.started_at||null,
  lastSuccessAt:lastSuccess?.finished_at||null,lastFinishedAt:latest?.finished_at||null};
}

export async function withServiceCronMonitoring(jobKey,req,handler){
 // Never record a manually unauthorised request as a scheduled run.
 const secret=String(process.env.CRON_SECRET||"").trim();
 if(process.env.VERCEL_ENV!=="production"||!secret||
   req?.headers?.get?.("authorization")!=="Bearer "+secret)
  return handler();
 let client=null,runId=null;
 try{
  client=db();
  if(client){
   const created=await client.from("service_cron_runs").insert({
    job_key:jobKey,state:"running",detail:"Arbeid pågår"
   }).select("id").single();
   if(created.error)console.error("SERVICE CRON MONITOR START FAILED",{job:jobKey});
   else runId=created.data?.id||null;
  }
 }catch{
  console.error("SERVICE CRON MONITOR START ERROR",{job:jobKey});
 }
 const finish=async(state,detail,httpStatus)=>{
  if(!client||!runId)return;
  try{
   const updated=await client.from("service_cron_runs").update({
    state,detail, http_status:httpStatus,finished_at:new Date().toISOString()
   }).eq("id",runId);
   if(updated.error)console.error("SERVICE CRON MONITOR FINISH FAILED",{job:jobKey});
  }catch{console.error("SERVICE CRON MONITOR FINISH ERROR",{job:jobKey});}
 };
 try{
  const response=await handler();
  let result=null;
  try{
   if(String(response?.headers?.get?.("content-type")||"").includes("application/json"))
    result=await response.clone().json();
  }catch{/* Monitor never changes the original response. */}
  const classified=serviceCronResponseStatus(response?.status,result);
  await finish(classified.state,classified.detail,response?.status||500);
  return response;
 }catch(error){
  await finish("failed","Ubehandlet serverfeil",500);
  throw error;
 }
}
