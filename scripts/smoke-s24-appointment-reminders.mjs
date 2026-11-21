import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(path,"utf8");
const osloDateKey=value=>new Intl.DateTimeFormat("en-CA",{
 year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Europe/Oslo"
}).format(value);
const shiftDateKey=(day,offset)=>{
 const date=new Date(day+"T12:00:00.000Z");
 date.setUTCDate(date.getUTCDate()+offset);
 return date.toISOString().slice(0,10);
};
const helperSource=read("lib/serviceAppointmentReminders.js")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {sameReminderAppointment,deliverAppointmentReminder}=new Function(
 "osloDateKey","shiftDateKey",helperSource+
 ";return {sameReminderAppointment,deliverAppointmentReminder};"
)(osloDateKey,shiftDateKey);
const now=new Date("2026-11-21T12:00:00.000Z");
const tomorrow=shiftDateKey(osloDateKey(now),1);
const slot="2026-11-22T09:00:00.000Z";
const confirmation="2026-11-21T11:00:00.000Z";
const ID="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const newOrder=()=>({
 id:ID,order_type:"custom",status:"confirmed",archived_at:null,
 order_number:"S24-SYNTHETIC",customer:{name:"Test Kunde",email:"example@example.invalid"},
 customer_user_id:null,
 survey_date:slot,survey_confirmation_sent_at:confirmation,survey_reminder_sent_at:null,
 job_start_at:slot,job_confirmation_sent_at:confirmation,job_reminder_sent_at:null,
 job_customer_agreement:"Test only – no real customer"
});
function mockStore(){
 const store={order:newOrder(),attempts:new Map(),emailCount:0,
  failClaim:false,failAck:false,preflightError:false,onClaim:null,
  notifications:[],now};
 const db={
  async rpc(name,args){
   if(name==="claim_service_appointment_reminder"){
    if(store.failClaim)return {data:null,error:{code:"test-claim-error"}};
    const kind=args.p_kind,fields=kind==="survey"?{
     date:"survey_date",confirmation:"survey_confirmation_sent_at",marker:"survey_reminder_sent_at"
    }:{date:"job_start_at",confirmation:"job_confirmation_sent_at",marker:"job_reminder_sent_at"};
    const row=store.order;
    if(row.order_type!=="custom"||row.status!=="confirmed"||row.archived_at||
     row[fields.marker]!=null||row[fields.date]!==args.p_expected_at||
     row[fields.confirmation]!==args.p_expected_confirmation||
     String(row.customer.email).toLowerCase()!==args.p_email)return {data:null,error:null};
    const unique=[kind,row.id,row[fields.date],row[fields.confirmation]].join("|");
    if(store.attempts.has(unique))return {data:null,error:null};
    const data={
     id:"bbbbbbbb-bbbb-4bbb-8bbb-"+String(store.attempts.size+1).padStart(12,"0"),
     order_id:row.id,kind,
     appointment_at:row[fields.date],confirmation_sent_at:row[fields.confirmation],
     recipient_email:args.p_email,state:"claimed"
    };
    store.attempts.set(unique,data);
    store.onClaim?.(store);
    return {data:{...data},error:null};
   }
   if(name==="acknowledge_service_appointment_reminder"){
    if(store.failAck)return {data:null,error:{code:"test-ack-failed"}};
    const entry=[...store.attempts.values()].find(a=>a.id===args.p_attempt_id);
    assert.ok(entry&&entry.state==="claimed");
    entry.state="sent";entry.resend_email_id=args.p_resend_email_id;
    const kind=entry.kind,fields=kind==="survey"?{
     date:"survey_date",confirmation:"survey_confirmation_sent_at",marker:"survey_reminder_sent_at"
    }:{date:"job_start_at",confirmation:"job_confirmation_sent_at",marker:"job_reminder_sent_at"};
    const row=store.order;
    const stillCurrent=String(row.customer?.email||"").toLowerCase()===entry.recipient_email&&
     row.status==="confirmed"&&row.order_type==="custom"&&!row.archived_at&&
     row[fields.date]===entry.appointment_at&&
     row[fields.confirmation]===entry.confirmation_sent_at&&row[fields.marker]==null;
    if(stillCurrent)row[fields.marker]=now.toISOString();
    return {data:{accepted_by_provider:true,marker_recorded:stillCurrent},error:null};
   }
   throw Error("Unexpected RPC "+name);
  },
  from(table){
   const query={filters:[],patch:null,
    select(){return query},
    eq(name,value){query.filters.push([name,value]);return query},
    update(value){query.patch=value;return query},
    async maybeSingle(){
     if(table==="orders")return store.preflightError?
      {data:null,error:{message:"test error"}}:{data:{...store.order,customer:{...store.order.customer}},error:null};
     assert.equal(table,"service_appointment_reminder_attempts");
     const entry=[...store.attempts.values()].find(a=>query.filters.every(([key,value])=>a[key]===value));
     if(!entry)return {data:null,error:null};
     if(query.patch)Object.assign(entry,query.patch);
     return {data:{id:entry.id},error:null};
    }
   };
   return query;
  }
 };
 const sendEmail=async(message,options)=>{
  store.emailCount++;
  assert.equal(message.to,"example@example.invalid");
  assert.match(options.idempotencyKey,/^service-appointment-reminder\/[0-9a-f-]{36}$/);
  store.notifications.push({message,options});
  return {data:{id:"resend-s24-synthetic-000001"},error:null};
 };
 return {store,db,sendEmail};
}
const send=(db,order,kind,sendEmail)=>deliverAppointmentReminder(db,order,{
 kind,targetDate:tomorrow,now,
 makeEmail:row=>({from:"Aadland Service <post@aadland-service.no>",
  to:row.customer.email,subject:"Synthetic only",html:"Synthetic reminder"}),
 sendEmail
});

let {store,db,sendEmail}=mockStore();
assert.equal(sameReminderAppointment(store.order,{
 appointment_at:slot,confirmation_sent_at:confirmation,recipient_email:"example@example.invalid"
},"survey",tomorrow),true);
let result=await send(db,{...store.order},"survey",sendEmail);
assert.equal(result.state,"sent");
assert.equal(store.emailCount,1);
assert.ok(store.order.survey_reminder_sent_at);
result=await send(db,newOrder(),"survey",sendEmail);
assert.equal(result.state,"skipped");
assert.equal(store.emailCount,1,"Same slot must NEVER trigger second email");
assert.equal([...store.attempts.values()][0].state,"sent");

({store,db,sendEmail}=mockStore());
result=await send(db,{...store.order},"job",async()=>{store.emailCount++;return {data:null,error:{message:"timeout"}}});
assert.equal(result.state,"needs_review");
assert.equal(store.emailCount,1);
assert.equal([...store.attempts.values()][0].state,"needs_review");
result=await send(db,newOrder(),"job",sendEmail);
assert.equal(result.state,"skipped");
assert.equal(store.emailCount,1,"Unknown Resend status must not be retried");

({store,db,sendEmail}=mockStore());
result=await send(db,{...store.order},"job",async()=>{store.emailCount++;throw Error("network uncertain")});
assert.equal(result.state,"needs_review");
assert.equal([...store.attempts.values()][0].state,"needs_review");
result=await send(db,newOrder(),"job",sendEmail);
assert.equal(store.emailCount,1,"Thrown network timeout cannot cause duplicate email");

({store,db,sendEmail}=mockStore());
store.onClaim=st=>{st.order.survey_date="2026-11-23T09:00:00.000Z";
 st.order.survey_confirmation_sent_at=null;};
result=await send(db,newOrder(),"survey",sendEmail);
assert.equal(result.state,"cancelled");
assert.equal(store.emailCount,0,"Reschedule before preflight must cancel original email");
assert.equal([...store.attempts.values()][0].state,"cancelled");
assert.equal(store.order.survey_reminder_sent_at,null);

({store,db,sendEmail}=mockStore());
store.onClaim=st=>{st.order.customer.email="changed@example.invalid";};
result=await send(db,newOrder(),"survey",sendEmail);
assert.equal(result.state,"cancelled");
assert.equal(store.emailCount,0,"Changed customer email must cancel original email");

({store,db,sendEmail}=mockStore());
const changedWhileSending=async(msg,opts)=>{
 store.emailCount++;
 store.order.job_start_at="2026-11-23T09:00:00.000Z";
 store.order.job_confirmation_sent_at=null;
 return {data:{id:"resend-s24-synthetic-000002"},error:null};
};
result=await send(db,newOrder(),"job",changedWhileSending);
assert.equal(result.state,"needs_review","Provider accepted old slot but plan was changed in flight");
assert.equal(result.reason,"appointment_changed_during_delivery");
assert.equal(store.order.job_reminder_sent_at,null,"Never stamp the new plan with an old receipt");
assert.equal([...store.attempts.values()][0].state,"sent","Actual provider receipt must still be recorded");

({store,db,sendEmail}=mockStore());
store.failAck=true;
result=await send(db,newOrder(),"survey",sendEmail);
assert.equal(result.state,"needs_review");
assert.equal(store.order.survey_reminder_sent_at,null);
assert.equal([...store.attempts.values()][0].state,"claimed");
result=await send(db,newOrder(),"survey",sendEmail);
assert.equal(result.state,"skipped");
assert.equal(store.emailCount,1,"Provider-accepted but unlogged result cannot be auto-retried");

({store,db,sendEmail}=mockStore());
store.preflightError=true;
result=await send(db,newOrder(),"survey",sendEmail);
assert.equal(result.state,"needs_review");
assert.equal(store.emailCount,0);
assert.equal([...store.attempts.values()][0].state,"needs_review");
({store,db,sendEmail}=mockStore());
store.failClaim=true;
result=await send(db,newOrder(),"survey",sendEmail);
assert.equal(result.state,"failed");
assert.equal(store.emailCount,0);
({store,db,sendEmail}=mockStore());
const noEmail=newOrder();noEmail.customer.email="";
result=await send(db,noEmail,"survey",sendEmail);
assert.equal(result.reason,"missing_recipient");
assert.equal(store.attempts.size,0);
result=await deliverAppointmentReminder(db,newOrder(),{
 kind:"survey",targetDate:"2026-11-23",now,
 makeEmail:()=>({to:"example@example.invalid"}),sendEmail
});
assert.equal(result.state,"failed");
assert.equal(result.reason,"invalid_reminder_target_day");
assert.equal(store.emailCount,0);

const sql=read("supabase/migrations/20261121221000_s24_appointment_reminder_outbox.sql");
for(const expected of [
 "create table public.service_appointment_reminder_attempts",
 "alter table public.service_appointment_reminder_attempts enable row level security",
 "revoke all on public.service_appointment_reminder_attempts from public,anon,authenticated",
 "s24_unique_confirmed_appointment",
 "for update",
 "on conflict on constraint s24_unique_confirmed_appointment do nothing",
 "create function public.claim_service_appointment_reminder(",
 "create function public.acknowledge_service_appointment_reminder(",
 "create function public.review_service_appointment_reminder(",
 "survey_date=a.appointment_at",
 "job_start_at=a.appointment_at",
 "survey_confirmation_sent_at=a.confirmation_sent_at",
 "job_confirmation_sent_at=a.confirmation_sent_at",
 "reviewed_unsent",
 "reminder_still_in_progress"
])assert.ok(sql.includes(expected),"Missing S24 SQL protection: "+expected);
for(const kind of ["survey","job"]){
 const route=read("app/api/cron/"+kind+"-reminders/route.js");
 const date=kind==="survey"?"survey_date":"job_start_at";
 const confirmed=kind==="survey"?"survey_confirmation_sent_at":"job_confirmation_sent_at";
 assert.ok(route.includes('withServiceCronMonitoring("'+kind+'-reminders"'));
 assert.ok(route.includes("cronGuard(req)"));
 assert.ok(route.includes('VERCEL_ENV!=="production"'));
 assert.ok(route.includes("deliverAppointmentReminder(s,order"));
 assert.ok(route.includes('kind:"'+kind+'"'));
 assert.ok(route.includes('.eq("status","confirmed")'));
 assert.ok(route.includes('.gte("'+date+'",from)'));
 assert.ok(route.includes('.not("'+confirmed+'","is",null)'));
 assert.ok(route.includes("resend.emails.send(message,options)"));
 assert.ok(!route.includes(".update({"+kind+"_reminder_sent_at:null"),"No clearing marker on uncertain send");
 assert.ok(route.includes('failed:failures.length'),"Ambiguous provider statuses enter S17 warning");
}
const admin=read("app/api/admin/service-reminders/route.js");
for(const expected of ['user?.role==="owner"','sameOriginGuard(req)',
 '"review_service_appointment_reminder"','"BEKREFTET I RESEND"','"IKKE SENDT"'])
 assert.ok(admin.includes(expected),"Owner review guard missing: "+expected);
const panel=read("app/admin/drift/ServiceReminderReviewClient.js");
assert.ok(panel.includes("Bekreft ikke sendt")&&panel.includes("starter ingen ny e-post"));
const dashboard=read("app/admin/drift/page.js");
assert.ok(dashboard.includes("<ServiceReminderReviewClient/>"));
const schedule=JSON.parse(read("vercel.json")).crons;
for(const kind of ["survey","job"])
 assert.ok(schedule.some(x=>x.path==="/api/cron/"+kind+"-reminders"));
assert.ok(schedule.some(x=>x.path==="/api/cron/rental-reminders"),"Rental schedule unaffected");
console.log("S-24 bestått: engangskrav, Resend-idempotens, uklar timeout uten retry, kansellert omplanlegging, feil mottaker, oppdatert sending og eieravstemming. Bare syntetiske data.");
