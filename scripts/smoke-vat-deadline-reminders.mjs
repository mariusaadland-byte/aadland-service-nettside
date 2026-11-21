import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=file=>readFileSync(file,"utf8");
const utilSource=read("lib/vatDeadlineReminders.js").replace(/^export /gm,"");
const {vatDeadline,daysBetweenCivilDates,vatDeadlineEvents,vatReminderEmail,isNorwegianNonWorkingDay}=
 new Function(utilSource+";return {vatDeadline,daysBetweenCivilDates,vatDeadlineEvents,vatReminderEmail,isNorwegianNonWorkingDay};")();
assert.equal(vatDeadline(2026,3),"2026-08-31");
assert.equal(vatDeadline(2026,4),"2026-10-12","Saturday moves deadline to Monday");
assert.equal(vatDeadline(2026,5),"2026-12-10");
assert.equal(vatDeadline(2026,6),"2027-02-10");
assert.equal(vatDeadline(2027,1),"2027-04-12","Saturday moves deadline to Monday");
assert.equal(vatDeadline(2027,4),"2027-10-11","Sunday moves deadline to Monday");
assert.equal(vatDeadline(2020,1),"2020-04-14","Good Friday plus Easter Monday shift to Tuesday");
assert.equal(vatDeadline(2023,3),"2023-08-31");
assert.equal(daysBetweenCivilDates("2026-11-26","2026-12-10"),14);
assert.equal(daysBetweenCivilDates("2026-11-12","2026-12-10"),28);
assert.throws(()=>daysBetweenCivilDates("2026-02-30","2026-03-03"));
assert.throws(()=>vatDeadline(2026,7));
const profile={first_term_year:2026,first_term:3};
assert.deepEqual(vatDeadlineEvents("2026-11-26",profile,[])
 .filter(x=>x.reminderDays!==null).map(x=>[x.year,x.term,x.reminderDays]),
 [[2026,5,14]]);
assert.equal(vatDeadlineEvents("2026-11-21",profile,[])
 .filter(x=>x.reminderDays!==null).length,0);
assert.equal(vatDeadlineEvents("2026-11-12",profile,[{year:2026,term:5,status:"filed"}])[0].status,"filed");
assert.equal(vatDeadlineEvents("2026-04-01",profile,[]).length,0,"Skip pre-registration periods");
const msg=vatReminderEmail({year:2026,term:5,deadline:"2026-12-10",daysLeft:14,status:"unverified"});
assert.ok(msg.subject.includes("14 dager"));
assert.ok(msg.text.includes("ikke kontrollert"));
assert.ok(msg.text.includes("Dette beviser ikke"));
assert.ok(msg.text.includes("Ingen MVA-melding er levert"));
assert.throws(()=>vatReminderEmail({year:2026,term:5,deadline:"2026-12-10",daysLeft:11,status:"unverified"}));

let today="2026-11-26",environment="production",profileRow={...profile},
 statuses=[],attempts=new Map(),sent=[],providerFails=false,acceptedWriteFails=false,completeFails=false,lookupFails=false;
const mockQuery=table=>{
 let equals=[],min=[],max=[];
 const q={
  select(){return q},
  eq(k,v){equals.push([k,v]);return q},
  gte(k,v){min.push([k,v]);return q},
  lte(k,v){max.push([k,v]);return q},
  maybeSingle(){return Promise.resolve({
   data:table==="vat_reporting_profile"?profileRow:statuses.find(x=>equals.every(([k,v])=>x[k]===v))||null,
   error:lookupFails?{code:"DB_READ_ERROR"}:null
  })},
  then(resolve,reject){
   if(table!=="vat_reporting_term_status")throw Error("Unexpected await "+table);
   return Promise.resolve({data:statuses.filter(x=>
    equals.every(([k,v])=>x[k]===v)&&min.every(([k,v])=>x[k]>=v)&&max.every(([k,v])=>x[k]<=v)),
    error:lookupFails?{code:"DB_READ_ERROR"}:null}).then(resolve,reject);
  }
 };
 return q;
};
const makeKey=p=>p.p_year+"-"+p.p_term+"-"+p.p_lead_days;
const db=()=>({
 from:mockQuery,
 async rpc(name,p){
  const k=makeKey(p),a=attempts.get(k);
  const submitted=statuses.find(x=>x.year===p.p_year&&x.term===p.p_term)?.status==="filed";
  if(name==="claim_vat_deadline_reminder"){
   if(submitted)return {data:{state:"skipped"},error:null};
   if(!profileRow||p.p_year*10+p.p_term<profileRow.first_term_year*10+profileRow.first_term)
    return {data:{state:"skipped"},error:null};
   assert.equal(daysBetweenCivilDates(p.p_today,p.p_due_date),p.p_lead_days);
   if(a)return {data:a.status==="provider_accepted"?
    {state:"provider_accepted",key:a.idempotencyKey}:{state:"blocked",reason:a.status},error:null};
   const key="vat-deadline/"+p.p_year+"/"+p.p_term+"/"+p.p_lead_days;
   attempts.set(k,{status:"claimed",idempotencyKey:key,providerId:null});
   return {data:{state:"claimed",key},error:null};
  }
  if(name==="skip_vat_deadline_reminder_if_filed"){
   if(!submitted)return {data:null,error:{message:"not filed"}};
   a.status="skipped";return {data:null,error:null};
  }
  if(name==="vat_deadline_reminder_uncertain"){
   if(a?.status==="claimed")a.status="needs_review";
   return {data:null,error:null};
  }
  if(name==="vat_deadline_reminder_provider_accepted"){
   if(acceptedWriteFails)return {data:null,error:{message:"DB ack failure"}};
   if(a?.status!=="claimed")return {data:null,error:{message:"wrong state"}};
   a.status="provider_accepted";a.providerId=p.p_provider_email_id;
   return {data:null,error:null};
  }
  if(name==="complete_vat_deadline_reminder"){
   if(completeFails)return {data:null,error:{message:"DB completion failure"}};
   if(a?.status!=="provider_accepted")return {data:null,error:{message:"provider not accepted"}};
   a.status="sent";return {data:{state:"sent"},error:null};
  }
  throw Error("Unknown RPC "+name);
 }
});
class FakeResend {
 emails={send:async(payload,opts)=>{
  sent.push({payload,opts});
  assert.equal(payload.to,"post@aadland-service.no");
  assert.equal(opts.idempotencyKey,"vat-deadline/2026/5/14");
  if(providerFails)throw Error("simulated Resend timeout");
  return {data:{id:"resend-mock-123"},error:null};
 }};
}
const cronText=read("app/api/cron/vat-deadline-reminders/route.js");
const cronCode=cronText.replace(/^import .*;\n/gm,"")
 .replace(/^export const [^\n]*\n/gm,"")
 .replace("export async function GET(","async function GET(")
 .replace('const {Resend}=await import("resend");',"const Resend=FakeResend;");
const NextResponse={json(body,opts={}){return {body,status:opts.status||200}}};
const route=new Function("NextResponse","db","cronGuard","osloDateKey","vatDeadlineEvents","vatReminderEmail","FakeResend","process",
 cronCode+";return {GET};"
)(NextResponse,db,()=>null,()=>today,vatDeadlineEvents,vatReminderEmail,FakeResend,
 {env:{get VERCEL_ENV(){return environment},RESEND_API_KEY:"MOCK-KEY"}});
const run=()=>route.GET({headers:{get:()=>""}});
let response=await run();
assert.equal(response.status,200);assert.equal(response.body.sent,1);
assert.equal(sent.length,1);assert.equal(attempts.get("2026-5-14").status,"sent");
response=await run();
assert.equal(response.body.sent,0);assert.equal(sent.length,1,"No repeat after duplicate cron");

attempts.clear();sent=[];providerFails=true;
response=await run();
assert.equal(response.status,503);assert.equal(response.body.failed,1);
assert.equal(attempts.get("2026-5-14").status,"needs_review");
response=await run();
assert.equal(sent.length,1,"Unknown send never auto-retries");
providerFails=false;

attempts.clear();sent=[];acceptedWriteFails=true;
response=await run();
assert.equal(response.status,503);assert.equal(sent.length,1);
assert.equal(attempts.get("2026-5-14").status,"claimed");
response=await run();assert.equal(sent.length,1,"Receipt-write failure does not resend");
acceptedWriteFails=false;

attempts.clear();sent=[];completeFails=true;
response=await run();assert.equal(response.status,503);
assert.equal(attempts.get("2026-5-14").status,"provider_accepted");
completeFails=false;
response=await run();
assert.equal(response.body.recovered,1);
assert.equal(sent.length,1,"Recovery must not contact provider again");
assert.equal(attempts.get("2026-5-14").status,"sent");

attempts.clear();sent=[];statuses=[{year:2026,term:5,status:"filed"}];
response=await run();assert.equal(response.body.sent,0);assert.equal(sent.length,0);
statuses=[];lookupFails=true;
response=await run();assert.equal(response.status,503);assert.equal(sent.length,0);
lookupFails=false;
profileRow=null;
response=await run();assert.equal(response.body.active,false);assert.equal(sent.length,0);
profileRow={...profile};
environment="preview";
response=await run();assert.equal(response.status,403);assert.equal(sent.length,0);
environment="production";
today="2026-11-21";
response=await run();assert.equal(response.body.checked,0);assert.equal(sent.length,0);
today="2026-11-26";

attempts.clear();sent=[];
const concurrent=await Promise.all([run(),run()]);
assert.equal(sent.length,1,"Concurrent cron requests share single DB claim");
assert.equal(concurrent.filter(x=>x.body.sent===1).length,1);

const migration=read("supabase/migrations/20261121043000_vat_deadline_reminder_attempts.sql");
for(const need of ["primary key(year,term,lead_days)","enable row level security",
 "claim_vat_deadline_reminder","provider_accepted","needs_review",
 "skip_vat_deadline_reminder_if_filed","complete_vat_deadline_reminder",
 "revoke all on public.vat_deadline_reminder_attempts from public,anon,authenticated",
 "grant execute on function public.claim_vat_deadline_reminder"])
 assert.ok(migration.includes(need),"Missing DB guard "+need);
const vercel=JSON.parse(read("vercel.json"));
assert.ok(vercel.crons.some(x=>x.path==="/api/cron/vat-deadline-reminders"));
assert.ok(cronText.includes('process.env.VERCEL_ENV!=="production"'));
const ownerRoute=read("app/api/admin/invoices/vat-deadline-reminders/route.js");
assert.ok(ownerRoute.includes('user?.role!=="owner"'));
assert.ok(!ownerRoute.includes("export async function POST("));
const ui=read("app/admin/faktura/mva/VatReportingControlClient.js");
assert.ok(ui.includes("<VatDeadlineReminderClient"));
console.log("S-07 bestått: frister/helligdager, 28+14 dager, én e-post, timeout-sperre, sikker gjenoppretting, eierstatus og preview-blokk.");
