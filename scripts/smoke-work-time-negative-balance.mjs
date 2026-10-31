import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const d=read("lib/workTimeDeduction.js").replace(/^export /gm,"");
const {netWorkMinutes,validDeductedMinutes,parseDeductionHours,clockAfterDeduction}=
 new Function(d+";return {netWorkMinutes,validDeductedMinutes,parseDeductionHours,clockAfterDeduction};")();
assert.equal(netWorkMinutes(120,parseDeductionHours("15")),-780,
 "2 hours worked minus 15 hours must show -13 hours, not an error");
assert.equal(netWorkMinutes(0,parseDeductionHours("15")),-900);
assert.equal(netWorkMinutes(180,parseDeductionHours("15")),-720);
assert.equal(netWorkMinutes(960,parseDeductionHours("15")),60);
assert.equal(clockAfterDeduction(0,"2026-10-31T08:00:00Z",Date.parse("2026-10-31T10:00:00Z"),900),"−13:00:00",
 "Running timer should count up from minus toward zero");
const stampSource=read("lib/workTimeStamps.js").replace(/^export /gm,"");
const {storedWorkStamps,workStamp,normalizeStampEdit}=new Function(stampSource+
 ";return {storedWorkStamps,workStamp,normalizeStampEdit};")();
const customerSource=read("lib/workClockCustomer.js").replace(/^export /gm,"");
const {parseWorkClockCustomerRef,resolveWorkClockCustomer}=new Function(customerSource+
 ";return {parseWorkClockCustomerRef,resolveWorkClockCustomer};")();
const accSource=read("lib/workTimeAccumulation.js").replace(/^export /gm,"");
const {accruedWorkMinutes}=new Function(accSource+";return {accruedWorkMinutes};")();
const raw=read("app/api/admin/work-time/route.js").replace(/^import .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const uid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const order="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const begin="2026-10-31T08:00:00.000Z";
const initial=()=>({
 id,admin_user_id:uid,order_id:order,customer_ref:"",
 work_date:"2026-10-31",duration_minutes:120,deducted_minutes:0,
 started_at:null,ended_at:null,work_sessions:[],lunch_days:[],updated_at:"2026-10-31T06:00:00Z",
 project_label:"Avtalt bilbytte",customer_label:"",note:"",hourly_rate_ore:50000,
 distance_km:0,km_rate_ore:530,toll_ore:0,created_at:begin
});
let row=initial(),writes=0,insertions=0;
const db=()=>({from(table){
 assert.equal(table,"work_time_entries");
 const q={
  filters:[],payload:null,mode:"read",
  select(fields){assert.ok(fields.includes("id"));return this;},
  eq(k,v){this.filters.push(["eq",k,v]);return this;},
  is(k,v){this.filters.push(["is",k,v]);return this;},
  update(data){this.mode="update";this.payload=data;return this;},
  insert(data){this.mode="insert";this.payload=data;return this;},
  async single(){
   if(this.mode!=="insert")throw Error("Unexpected read .single");
   insertions++;row={...initial(),...this.payload};return {data:{...row},error:null};
  },
  async maybeSingle(){
   const matches=this.filters.every(([op,k,v])=>
    op==="is"?row[k]===v:String(row[k])===String(v));
   if(!matches)return {data:null,error:null};
   if(this.mode==="update"){row={...row,...this.payload};writes++;}
   return {data:{...row},error:null};
  }
 };
 return q;
}});
const NextResponse={json:(body,opts={})=>({status:opts.status||200,body})};
const route=new Function("NextResponse","sameOriginGuard","getAdminUser","db",
 "isValidDateInput","osloDateKey","accruedWorkMinutes","storedWorkStamps",
 "workStamp","normalizeStampEdit","netWorkMinutes","validDeductedMinutes",
 "parseWorkClockCustomerRef","resolveWorkClockCustomer","console",raw+
 ";return {POST,PATCH};")(NextResponse,()=>null,async()=>({id:uid,role:"owner"}),db,
 ()=>true,()=>"2026-10-31",accruedWorkMinutes,storedWorkStamps,workStamp,normalizeStampEdit,
 netWorkMinutes,validDeductedMinutes,parseWorkClockCustomerRef,resolveWorkClockCustomer,{error(){}});
const patch=body=>route.PATCH({json:async()=>({id,action:"update",...body})});
const post=body=>route.POST({json:async()=>body});
// Existing project with 2 hours already saved: now attach 15 negative hours.
let r=await patch({workDate:"2026-10-31",durationMinutes:120,deductedMinutes:900,
 orderId:order,hourlyRateOre:50000});
assert.equal(r.status,200,"Existing orders must accept -15 hours against 2 hours of work");
assert.equal(row.duration_minutes,120);
assert.equal(row.deducted_minutes,900);
assert.equal(r.body.entry.netDurationMinutes,-780);
assert.equal(writes,1);
// No need to invent a minute of work to add an initial negative balance.
r=await route.POST({json:async()=>({action:"manual",workDate:"2026-10-31",
 durationMinutes:0,deductedMinutes:900,orderId:order,hourlyRateOre:50000})});
assert.equal(r.status,200,"Start with -15 hours and zero worked time");
assert.equal(r.body.entry.netDurationMinutes,-900);
// Running project clock accepts 15 hours of initial minus without waiting 15 h.
r=await route.POST({json:async()=>({action:"start",orderId:order,
 deductedMinutes:900,hourlyRateOre:50000})});
assert.equal(r.status,200);
assert.equal(r.body.entry.netDurationMinutes,-900);
const firstUpdatedAt=row.updated_at;
r=await route.PATCH({json:async()=>({action:"setDeduction",id,
 deductedMinutes:930,expectedUpdatedAt:firstUpdatedAt})});
assert.equal(r.status,200);
assert.equal(row.deducted_minutes,930);
assert.equal(r.body.entry.netDurationMinutes,-930);
r=await route.PATCH({json:async()=>({action:"setDeduction",id,
 deductedMinutes:960,expectedUpdatedAt:firstUpdatedAt})});
assert.equal(r.status,409,"Don't overwrite a changed clock from a stale mobile view");
assert.equal(row.deducted_minutes,930);
// A 30-minute lunch still works while in minus.
r=await route.PATCH({json:async()=>({action:"deduct",id,deltaMinutes:30,
 expectedUpdatedAt:row.updated_at})});
assert.equal(r.status,200);
assert.equal(row.deducted_minutes,960);
assert.equal(r.body.entry.netDurationMinutes,-960);
r=await route.PATCH({json:async()=>({action:"deduct",id,deltaMinutes:30,
 expectedUpdatedAt:row.updated_at})});
assert.equal(r.status,409,"Prevent double lunch even with negative starting balance");
// Stop should be allowed while still in minus and keep the exact stamped time.
r=await route.PATCH({json:async()=>({action:"stop",id})});
assert.equal(r.status,200,"Stopping before reaching zero must be allowed");
assert.ok(row.ended_at);
assert.ok(row.duration_minutes>0);
assert.ok(row.deducted_minutes>row.duration_minutes);
assert.equal(r.body.entry.netDurationMinutes,row.duration_minutes-row.deducted_minutes);
// Don't allow an entry with neither gross time nor minus time.
r=await route.POST({json:async()=>({action:"manual",workDate:"2026-10-31",
 durationMinutes:0,deductedMinutes:0,orderId:order,hourlyRateOre:50000})});
assert.equal(r.status,400);
const ui=read("app/admin/arbeidsklokke/WorkClockClient.js");
assert.ok(ui.includes('onClick={saveRunningMinus}'));
assert.ok(ui.includes('action:"setDeduction"'));
assert.ok(ui.includes("deductedMinutes=parseDeductionHours(timerDraft.deductedHours)"));
assert.ok(ui.includes("setNetMinutesByScope(data.netMinutesByScope||{})"));
assert.ok(ui.includes('Samlet timessaldo for oppdraget'));
assert.ok(ui.includes('Lagre minustid'));
assert.ok(ui.includes('Minustid ved start (timer)'));
assert.ok(!ui.includes("hours(Math.max(0,entry.durationMinutes-(entry.deductedMinutes||0))"));
assert.ok(!raw.includes("Minustiden kan ikke overstige samlet registrert arbeidstid."));
assert.ok(!raw.includes("Lunsj-/minustiden er større enn klokkens arbeidstid."));
assert.ok(raw.includes('netMinutesByScope[key]'));
assert.ok(raw.includes('netWorkMinutes(Number(entry.duration_minutes)||0,Number(entry.deducted_minutes)||0)'));
assert.ok(ui.includes('((entry.durationMinutes-(entry.deductedMinutes||0))/60).toFixed(2)'),
 "Excel should show -13 instead of zero");
console.log("Negativ minustid bestått: oppdrag med -15 timer, 0 arbeidstime, aktiv klokke, lunsj, full stopp, hele oppdragssaldoen og Excel.");
