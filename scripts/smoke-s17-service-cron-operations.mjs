import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
const src=read("lib/serviceCronMonitor.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const records=[],updates=[];
const db=()=>({from(table){
 assert.equal(table,"service_cron_runs");
 return {
  insert(row){
   records.push(row);
   return {select(){return {single:async()=>({data:{id:"test-run-"+records.length},error:null})}}}
  },
  update(row){updates.push(row);return {eq:async()=>({error:null})}}
 };
}});
const environment={env:{VERCEL_ENV:"production",CRON_SECRET:"fake-secret"}};
const {
 SERVICE_CRON_JOBS,SERVICE_CRON_FIRST_COMPLETE_DAY,serviceCronResponseStatus,
 serviceCronDailyStatus,withServiceCronMonitoring
}=new Function("db","process",src+";return {SERVICE_CRON_JOBS,SERVICE_CRON_FIRST_COMPLETE_DAY,serviceCronResponseStatus,serviceCronDailyStatus,withServiceCronMonitoring};")(db,environment);

assert.equal(SERVICE_CRON_JOBS.length,9);
assert.ok(SERVICE_CRON_JOBS.every(j=>!j.key.startsWith("rental")&&j.key!=="payment-receipts"));
assert.equal(SERVICE_CRON_FIRST_COMPLETE_DAY,"2026-11-23");
assert.equal(serviceCronResponseStatus(200,{ok:true,sent:0}).state,"ok","No work is valid success");
assert.equal(serviceCronResponseStatus(200,{ok:true,failed:1}).state,"warning");
assert.equal(serviceCronResponseStatus(200,{ok:true,failures:[{id:"ignored"}]}).state,"warning");
assert.equal(serviceCronResponseStatus(200,{ok:true,results:[{status:"needs_review"}]}).state,"warning");
assert.equal(serviceCronResponseStatus(200,{ok:true,recoveredForReview:1}).state,"warning");
assert.equal(serviceCronResponseStatus(200,{setupRequired:true}).state,"warning");
assert.equal(serviceCronResponseStatus(503,{}).state,"failed");
assert.equal(serviceCronResponseStatus(409,{}).state,"warning");
const day="2026-11-23";
let st=serviceCronDailyStatus(SERVICE_CRON_JOBS[0],[],day);
assert.equal(st.state,"missing");
st=serviceCronDailyStatus(SERVICE_CRON_JOBS[0],[{
 job_key:SERVICE_CRON_JOBS[0].key,state:"ok",detail:"OK",
 started_at:day+"T08:00:00.000Z",finished_at:day+"T08:00:01.000Z"
}],day);
assert.equal(st.state,"ok");
assert.ok(st.lastSuccessAt);
st=serviceCronDailyStatus(SERVICE_CRON_JOBS[0],[
 {job_key:SERVICE_CRON_JOBS[0].key,state:"failed",detail:"HTTP 503",started_at:day+"T08:02:00.000Z",finished_at:day+"T08:02:01.000Z"},
 {job_key:SERVICE_CRON_JOBS[0].key,state:"ok",detail:"OK",started_at:day+"T08:00:00.000Z",finished_at:day+"T08:00:01.000Z"}
],day);
assert.equal(st.state,"failed","Newer failed run must not be concealed by older success");
assert.ok(st.lastSuccessAt);
assert.equal(serviceCronDailyStatus(SERVICE_CRON_JOBS[0],[],"2026-11-22").state,"starting");

const auth="Bearer fake-secret";
let resp=await withServiceCronMonitoring("survey-reminders",{headers:new Headers({authorization:auth})},
 async()=>Response.json({ok:true,sent:0}));
assert.equal(resp.status,200);assert.equal(records.length,1);
assert.equal(updates[0].state,"ok");
resp=await withServiceCronMonitoring("survey-reminders",{headers:new Headers({authorization:auth})},
 async()=>Response.json({ok:true,failed:2}));
assert.equal(resp.status,200);assert.equal(updates.at(-1).state,"warning");
resp=await withServiceCronMonitoring("survey-reminders",{headers:new Headers({authorization:auth})},
 async()=>Response.json({error:"test-only"},{status:503}));
assert.equal(resp.status,503);assert.equal(updates.at(-1).state,"failed");
await assert.rejects(
 ()=>withServiceCronMonitoring("survey-reminders",{headers:new Headers({authorization:auth})},
 async()=>{throw Error("simulated uncaught failure");}),
 /simulated uncaught failure/
);
assert.equal(updates.at(-1).state,"failed");
const count=records.length;
await withServiceCronMonitoring("survey-reminders",{headers:new Headers({authorization:"Bearer wrong"})},
 async()=>Response.json({ok:true}));
assert.equal(records.length,count,"Unauthorized requests never write cron-run records");
environment.env.VERCEL_ENV="preview";
await withServiceCronMonitoring("survey-reminders",{headers:new Headers({authorization:auth})},
 async()=>Response.json({ok:true}));
assert.equal(records.length,count,"Preview does not log real cron runs");
environment.env.VERCEL_ENV="production";

for(const job of SERVICE_CRON_JOBS){
 const path="app/api/cron/"+job.key+"/route.js";
 const route=read(path);
 assert.ok(route.includes('withServiceCronMonitoring("'+job.key+'"'),"Missing wrapper in "+path);
 assert.ok(route.includes("export async function GET(req)"));
 assert.ok(route.includes("async function runServiceCron(req)"));
 assert.ok(route.includes("cronGuard(req)"),"Existing authorization remains");
}
const schedule=JSON.parse(read("vercel.json")).crons;
assert.ok(schedule.some(x=>x.path==="/api/cron/service-health-alerts"&&x.schedule==="30 14 * * *"));
for(const job of SERVICE_CRON_JOBS)assert.ok(schedule.some(x=>x.path==="/api/cron/"+job.key));
assert.ok(schedule.some(x=>x.path==="/api/cron/rental-reminders"),"No change to rentals");

const migration=read("supabase/migrations/20261121141809_service_cron_monitoring_s17.sql");
for(const t of ["service_cron_runs","service_cron_alert_batches"]){
 assert.ok(migration.includes("alter table public."+t+" enable row level security"));
 assert.ok(migration.includes("revoke all on public."+t+" from public,anon,authenticated"));
 assert.ok(migration.includes("grant select,insert,update on public."+t+" to service_role"));
}
assert.ok(migration.includes("constraint service_cron_finished_state"));
assert.ok(migration.includes("constraint service_cron_alert_sent_state"));
const alert=read("app/api/cron/service-health-alerts/route.js");
for(const expected of ['cronGuard(req)','VERCEL_ENV!=="production"',
 '"post@aadland-service.no"','service_cron_alert_batches','idempotencyKey:"service-cron-health/"+id',
 'existing.data','state:"uncertain"','SERVICE_CRON_FIRST_COMPLETE_DAY'])
 assert.ok(alert.includes(expected),"Missing owner watchdog guard: "+expected);
assert.ok(!alert.includes("invoice_drafts").valueOf(),"Watchdog cannot issue invoices");
const page=read("app/admin/drift/page.js");
assert.ok(page.includes('admin.role!=="owner"'));
assert.ok(page.includes('service_cron_runs')&&page.includes('service_cron_alert_batches'));
assert.ok(!page.includes('.insert(')&&!page.includes('.update('),"Dashboard is read-only");
const nav=read("app/admin/AdminClient.js");
assert.ok(nav.includes('["drift", "Driftskontroll"]'));
console.log("S-17 bestått: 9 Service-jobber, skrivende kun intern driftslogg, manglende kjøringer, feil, advarsler og eierbeskyttet oversikt kontrollert uten e-post.");

for(const key of ["service-order-confirmations","quote-response-confirmations","contact-image-cleanup"]){const job=SERVICE_CRON_JOBS.find(x=>x.key===key);assert.equal(serviceCronDailyStatus(job,[],"2026-11-26").state,"starting");assert.equal(serviceCronDailyStatus(job,[],"2026-11-27").state,"missing");}
assert.equal(serviceCronResponseStatus(207,{ok:true,requiresReview:1}).state,"warning");
assert.equal(serviceCronResponseStatus(200,{ok:true,review:1}).state,"warning");
assert.ok(alert.includes('x.state!=="ok"&&x.state!=="starting"'));
