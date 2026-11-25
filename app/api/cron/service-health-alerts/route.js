import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {cronGuard} from "../../../../lib/cronAuth";
import {
 SERVICE_CRON_JOBS,SERVICE_CRON_FIRST_COMPLETE_DAY,serviceCronDailyStatus
} from "../../../../lib/serviceCronMonitor";

export const runtime="nodejs";
export const maxDuration=60;
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});

// This is a *separate* watchdog. A broken Vercel scheduler, a broken DB, or an
// unavailable Resend service can prevent the watchdog itself from alerting.
export async function GET(req){
 const denial=cronGuard(req);if(denial)return denial;
 if(process.env.VERCEL_ENV!=="production")
  return json({error:"Driftsvarsling kjøres bare i produksjon."},403);
 const day=new Date().toISOString().slice(0,10);
 if(day<SERVICE_CRON_FIRST_COMPLETE_DAY)
  return json({ok:true,monitored:false,reason:"Venter på første hele driftsdag."});
 const s=db();if(!s)return json({error:"Database ikke konfigurert."},503);
 const history=await s.from("service_cron_runs")
  .select("job_key,state,detail,started_at,finished_at")
  .gte("started_at",day+"T00:00:00.000Z")
  .order("started_at",{ascending:false}).limit(500);
 if(history.error||!Array.isArray(history.data)||history.data.length>=500)
  return json({error:"Driftsloggen kunne ikke leses fullstendig."},503);
 const health=SERVICE_CRON_JOBS.map(job=>serviceCronDailyStatus(job,history.data,day));
 const issues=health.filter(x=>x.state!=="ok"&&x.state!=="starting");
 if(!issues.length)return json({ok:true,date:day,checked:health.length,problems:0,sent:0});
 if(!process.env.RESEND_API_KEY)
  return json({error:"Feil oppdaget, men e-postvarsling er ikke konfigurert."},503);
 const existing=await s.from("service_cron_alert_batches")
  .select("id,state,created_at").eq("alert_day",day).maybeSingle();
 if(existing.error)return json({error:"Varslingshistorikken kunne ikke kontrolleres."},503);
 if(existing.data){
  return json({ok:existing.data.state==="sent",alreadyRecorded:true,
   problems:issues.length,alertState:existing.data.state},
   existing.data.state==="sent"?200:409);
 }
 const subject="Aadland Service – driftskontroll: "+issues.length+" jobb(er) må undersøkes";
 const body=[
  "AUTOMATISK DRIFTSKONTROLL – SERVICE",
  "",
  "Dato (UTC): "+day,
  "Antall berørte jobber: "+issues.length,
  "",
  ...issues.map(x=>"- "+x.label+" ("+x.schedule+"): "+x.state+" – "+x.detail),
  "",
  "Åpne den eierbeskyttede siden:",
  "https://www.aadland-service.no/admin/drift",
  "",
  "Dette er bare driftsstatus. Det er ikke sendt kunde-e-post eller laget fakturaer av denne kontrollen.",
  "Kontroller fakturaarkiv, Resend og Vercel før du prøver usikre utsendinger igjen.",
  "",
  "Aadland Service"
 ].join("\n");
 const created=await s.from("service_cron_alert_batches")
  .insert({alert_day:day,state:"pending",issue_count:issues.length})
  .select("id").single();
 if(created.error){
  // An overlapping watchdog may have inserted a batch; never send again.
  return json({error:"Varslingsforsøket kunne ikke låses. Kontroller driftsoversikten."},409);
 }
 const id=created.data?.id;
 if(!id)return json({error:"Varslingsforsøket mangler ID."},503);
 try{
  const {Resend}=await import("../../../../lib/safeResend");
  const result=await new Resend(process.env.RESEND_API_KEY).emails.send({
   from:"Aadland Service <noreply@aadland-service.no>",
   to:"post@aadland-service.no",replyTo:"post@aadland-service.no",
   subject,text:body
  },{idempotencyKey:"service-cron-health/"+id});
  if(result.error||!result.data?.id)throw Error("E-poststatus kunne ikke bekreftes.");
  const saved=await s.from("service_cron_alert_batches")
   .update({state:"sent",sent_at:new Date().toISOString()})
   .eq("id",id).eq("state","pending");
  if(saved.error)return json({error:"E-post kan være sendt. Avstem Resend før noe nytt sendeforsøk."},503);
  return json({ok:true,date:day,checked:health.length,problems:issues.length,sent:1});
 }catch{
  const failed=await s.from("service_cron_alert_batches")
   .update({state:"uncertain"}).eq("id",id).eq("state","pending");
  if(failed.error)console.error("SERVICE CRON WATCHDOG HOLD FAILED");
  console.error("SERVICE CRON WATCHDOG DELIVERY UNKNOWN",{issues:issues.length});
  return json({error:"Driftsvarselets sendestatus er usikker. Kontroller Resend, ikke send automatisk på nytt."},503);
 }
}
