import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync("app/api/admin/jobs/plan/route.js","utf8").replace(/^import .*;\n/gm,"").replace(/export /g,"");
const {validDate,savePlan}=new Function("NextResponse","getAdminUser","db","sameOriginGuard",route+"return {validDate,savePlan};")({},()=>null,()=>null,()=>null);
assert.equal(validDate("2026-02-30T10:00:00Z"),null);
assert.equal(validDate("2026-10-21T10:00:00Z"),"2026-10-21T10:00:00.000Z");
assert.equal(validDate("2026-10-21T10:00:00+02:00"),null);
const start="2026-10-23T08:00:00.000Z";
let calls=[];
const mock={rpc:async(name,args)=>{
 calls.push({name,args});
 return {data:{changed:false,revision:"00000000-0000-4000-8000-000000000001",
  start_at:args.p_start_at,agreement:args.p_agreement,
  confirmation_sent_at:"2026-10-23T09:00:00.000Z",reminder_sent_at:null},error:null};
}};
const saved=await savePlan(mock,"00000000-0000-4000-8000-000000000002",start,"Klargjør rommet",null,{
 customer:{email:"test@example.invalid"},job_confirmation_sent_at:"2026-10-23T09:00:00.000Z"
});
assert.equal(calls.length,1);
assert.equal(calls[0].name,"save_job_plan_once");
assert.equal(calls[0].args.p_expected_revision,null);
assert.equal(saved.changed,false);
assert.ok(saved.data.job_confirmation_sent_at,"Same-plan save must retain confirmation");
assert.equal(saved.revision,"00000000-0000-4000-8000-000000000001");
const old=calls.length;
assert.equal((await savePlan(mock,"test","2026-02-30T10:00:00Z","Avtale")).status,400);
assert.equal((await savePlan(mock,"test",start,"")).status,400);
assert.equal(calls.length,old);
const stale=await savePlan({rpc:async()=>({data:null,error:{message:"S27_STALE_PLAN"}})},"test",start,"Avtale",null,{});
assert.equal(stale.status,409);
const ui=readFileSync("app/admin/oppdrag/[id]/planlegg/PlanJobClient.js","utf8");
assert.ok(ui.includes("expectedRevision:job?.planRevision||null"));
assert.ok(ui.includes("disabled={saving||sending||reviewing||cannotSend}"));
assert.ok(ui.includes("blockedByUnresolved"));
assert.ok(ui.includes("Bekreftelse er sendt til "));
assert.ok(ui.includes("function review()"));
console.log("Oppdragsplanlegging S-27: atomisk revisjonslagring, dato, status og sikker UI bestått.");
