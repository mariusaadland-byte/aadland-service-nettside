import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const helpers=read("lib/workTimeDeduction.js").replace(/^export /gm,"");
const {netWorkMinutes,validDeductedMinutes,clockAfterDeduction}=new Function(helpers+
 ";return {netWorkMinutes,validDeductedMinutes,clockAfterDeduction};")();
assert.equal(netWorkMinutes(90,30),60);
assert.equal(netWorkMinutes(90,0),90);
assert.equal(netWorkMinutes(10,30),-20,"A running timer may have unearned deducted time");
assert.equal(validDeductedMinutes(-30),null);
assert.equal(validDeductedMinutes(30.5),null);
assert.equal(clockAfterDeduction(0,"2026-10-31T08:00:00Z",Date.parse("2026-10-31T08:00:00Z"),30),"−00:30:00");
assert.equal(clockAfterDeduction(0,"2026-10-31T08:00:00Z",Date.parse("2026-10-31T08:30:00Z"),30),"00:00:00");
assert.equal(clockAfterDeduction(0,"2026-10-31T08:00:00Z",Date.parse("2026-10-31T09:00:00Z"),30),"00:30:00");
const stampsSource=read("lib/workTimeStamps.js").replace(/^export /gm,"");
const {storedWorkStamps,workStamp,normalizeStampEdit}=new Function(stampsSource+
 ";return {storedWorkStamps,workStamp,normalizeStampEdit};")();
const raw=read("app/api/admin/work-time/route.js").replace(/^import .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const userId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const entryId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orderId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const today="2026-10-31",begin="2026-10-31T09:00:00.000Z";
let work={id:entryId,admin_user_id:userId,order_id:null,started_at:begin,
 ended_at:null,duration_minutes:0,deducted_minutes:0,lunch_days:[],work_sessions:[],
 updated_at:"2026-10-31T09:00:00.000Z",work_date:today,
 project_label:"Diverse",customer_label:"",note:"",hourly_rate_ore:50000,
 distance_km:0,km_rate_ore:530,toll_ore:0};
let credit=null,workUpdates=0,creditWrites=0,readRole="owner";
const DB=()=>({from(name){
 const x={
  name,filters:[],payload:null,
  select(fields){return this;},
  eq(k,v){this.filters.push(["eq",k,v]);return this;},
  is(k,v){this.filters.push(["is",k,v]);return this;},
  update(value){this.payload=value;return this;},
  upsert(value,opt){assert.deepEqual(opt,{onConflict:"admin_user_id,scope_key"});
   this.payload=value;return this;},
  async maybeSingle(){
   if(name==="work_time_entries"){
    const match=this.filters.every(([op,k,v])=>op==="is"?work[k]===v:String(work[k])===String(v));
    if(!match)return {data:null,error:null};
    if(this.payload){work={...work,...this.payload};workUpdates++;}
    return {data:{...work},error:null};
   }
   if(name==="orders"){
    const valid=this.filters.find(f=>f[1]==="id")?.[2]===orderId;
    return {data:valid?{id:orderId,order_type:"custom",status:"confirmed"}:null,error:null};
   }
   throw Error("Unexpected table "+name);
  },
  async single(){
   assert.equal(name,"work_time_value_credits");
   credit=this.payload;creditWrites++;
   return {data:{scope_key:credit.scope_key,agreed_value_ore:credit.agreed_value_ore,
    description:credit.description,updated_at:credit.updated_at},error:null};
  }
 };
 return x;
}});
const NextResponse={json:(body,opts={})=>({body,status:opts.status||200})};
const endpoints=new Function("NextResponse","sameOriginGuard","getAdminUser","db",
 "isValidDateInput","osloDateKey","accruedWorkMinutes","storedWorkStamps",
 "workStamp","normalizeStampEdit","netWorkMinutes","validDeductedMinutes","console",
 raw+";return {POST,PATCH};")(NextResponse,()=>null,
 async()=>readRole==="owner"?{role:"owner",id:userId}:null,DB,
 ()=>true,()=>today,()=>0,storedWorkStamps,workStamp,normalizeStampEdit,
 netWorkMinutes,validDeductedMinutes,{error(){}});
const patch=body=>endpoints.PATCH({json:async()=>({id:entryId,...body})});
const post=body=>endpoints.POST({json:async()=>body});
let result=await patch({action:"deduct",deltaMinutes:30,expectedUpdatedAt:work.updated_at});
assert.equal(result.status,200);
assert.equal(work.deducted_minutes,30);
assert.deepEqual(work.lunch_days,[today]);
assert.equal(work.duration_minutes,0,"Lunch must never alter clocked gross duration or stamps");
assert.equal(workUpdates,1);
result=await patch({action:"deduct",deltaMinutes:30,expectedUpdatedAt:work.updated_at});
assert.equal(result.status,409,"Lunch is at most once a day on same entry");
assert.equal(workUpdates,1);
result=await patch({action:"deduct",deltaMinutes:-30,expectedUpdatedAt:work.updated_at});
assert.equal(result.status,200,"Undo today's lunch");
assert.equal(work.deducted_minutes,0);
assert.deepEqual(work.lunch_days,[]);
result=await patch({action:"deduct",deltaMinutes:30,expectedUpdatedAt:"outdated"});
assert.equal(result.status,409,"Stale mobile request must not deduct twice");
assert.equal(workUpdates,2);
result=await post({action:"setOrderCredit",orderId,agreedValueOre:500000,
 creditDescription:"Bil – arbeid mot avtalt verdi"});
assert.equal(result.status,200,"Credit can be assigned to a previously created project even before tracking time");
assert.equal(credit.scope_key,"order:"+orderId);
assert.equal(credit.agreed_value_ore,500000);
assert.equal(creditWrites,1);
result=await post({action:"setOrderCredit",orderId:"bad",agreedValueOre:500000});
assert.equal(result.status,400,"Cannot set credit for arbitrary or nonexistent order");
result=await patch({action:"setCredit",agreedValueOre:500000,
 creditDescription:"Bil på frittstående timer"});
assert.equal(result.status,200);
assert.equal(credit.scope_key,"entry:"+entryId);
assert.equal(creditWrites,2);
readRole="guest";
result=await post({action:"setOrderCredit",orderId,agreedValueOre:500000});
assert.equal(result.status,403,"Value offsets remain behind the work-clock's admin permission");
readRole="owner";
const ui=read("app/admin/arbeidsklokke/WorkClockClient.js");
const css=read("app/admin/arbeidsklokke/workClock.module.css");
const migrationA=read("supabase/migrations/20261031220000_work_time_minus_breaks.sql");
const migrationB=read("supabase/migrations/20261031221000_work_time_value_credits.sql");
assert.ok(ui.includes("🍽️ "), "One-tap lunch button must be present");
assert.ok(ui.includes('onClick={()=>lunch(30)}'));
assert.ok(ui.includes('onClick={()=>lunch(-30)}'));
assert.ok(ui.includes('disabled={busy||active.lunchDays?.includes(osloDate())}'));
assert.ok(ui.includes('netDurationMinutes')||ui.includes('entry.durationMinutes-(entry.deductedMinutes||0)'));
assert.ok(ui.includes('"setOrderCredit"'),"Existing orders must support credit");
assert.ok(ui.includes('"order:"+selectedCreditOrder'));
assert.ok(ui.includes("Til fakturering utover avtalen"));
assert.ok(ui.includes("showCreditEditor(active)"));
assert.ok(ui.includes('creditEditor.orderId?"setOrderCredit":"setCredit"'),
 "Standalone registrations and real projects use separate credit actions");
assert.ok(css.includes(".lunchButton")&&css.includes(".creditProject"));
assert.ok(migrationA.includes("deducted_minutes integer not null default 0"));
assert.ok(migrationA.includes("lunch_days jsonb not null default '[]'"));
assert.ok(migrationB.includes("enable row level security"));
assert.ok(migrationB.includes("revoke all"));
assert.ok(raw.includes('order("id",{ascending:true}).range(offset,offset+499)'),
 "All project entries across earlier months contribute to the work value");
assert.ok(raw.includes("Math.round(net*(Number(entry.hourly_rate_ore)||0)/60)"));
console.log("Lunsj −30 og avtalte prosjektverdier bestått: én lunsj per dag, angre, bevarte stemplinger, arbeid mot bilverdi, eksisterende oppdrag, tilgang og fakturerbart overskudd.");
