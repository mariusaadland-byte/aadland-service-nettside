import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const helper=read("lib/workTimeStamps.js").replace(/^export /gm,"");
const {storedWorkStamps,workStamp,normalizeStampEdit,totalStampedMinutes}=
 new Function(helper+";return {storedWorkStamps,workStamp,normalizeStampEdit,totalStampedMinutes};")();
const first=workStamp("2026-10-30T08:00:00Z","2026-10-30T09:00:00Z");
const second=workStamp("2026-10-31T10:00:00Z","2026-10-31T10:30:00Z");
assert.equal(first.minutes,60);
assert.equal(second.minutes,30);
const old={duration_minutes:90,started_at:second.startedAt,ended_at:second.endedAt,work_sessions:[first,second]};
const changed=normalizeStampEdit([first,{...second,endedAt:"2026-10-31T11:30:00.000Z"}],old);
assert.equal(changed.minutes,150,"Changed stamp must update total (60+90)");
assert.equal(changed.stamps.length,2);
assert.equal(changed.stamps[0].minutes,60,"Unedited stamp must stay exactly the same");
assert.equal(changed.stamps[1].minutes,90);
assert.equal(totalStampedMinutes(changed.stamps),150);
const overlap=normalizeStampEdit([first,workStamp("2026-10-30T08:45:00Z","2026-10-30T09:15:00Z")],old);
assert.match(overlap.error,/overlapper/);
assert.match(normalizeStampEdit([first,{startedAt:"",endedAt:""}],old).error,/Velg både/);
assert.ok(normalizeStampEdit([],old).error,"Cannot save row with all actual stamp sessions deleted");
const backfilled=storedWorkStamps({
 duration_minutes:150,started_at:second.startedAt,ended_at:second.endedAt
});
assert.equal(backfilled.length,2);
assert.equal(backfilled[0].minutes,120);
assert.equal(backfilled[0].historical,true);
assert.equal(backfilled[1].minutes,30);
assert.ok(normalizeStampEdit([first,second],{...old,work_sessions:backfilled}).error,
 "Cannot silently delete a legacy amount with no known stamp times");
const preserved=normalizeStampEdit([backfilled[0],{...backfilled[1],endedAt:"2026-10-31T11:00:00Z"}],
 {...old,work_sessions:backfilled});
assert.equal(preserved.minutes,180,"Preserve 120 unassigned historical minutes + corrected 60 minutes");
assert.equal(preserved.stamps[0].minutes,120);

const workDeductionSource=read("lib/workTimeDeduction.js").replace(/^export /gm,"");
const {netWorkMinutes,validDeductedMinutes}=new Function(workDeductionSource+
 ";return {netWorkMinutes,validDeductedMinutes};")();
const customerSource=read("lib/workClockCustomer.js").replace(/^export /gm,"");
const {parseWorkClockCustomerRef,resolveWorkClockCustomer}=new Function(customerSource+
 ";return {parseWorkClockCustomerRef,resolveWorkClockCustomer};")();
const raw=read("app/api/admin/work-time/route.js")
 .replace(/^import .*;\n/gm,"").replace(/^export async function /gm,"async function ");
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const admin="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let row={id,admin_user_id:admin,order_id:null,work_date:"2026-10-30",
 project_label:"Diverse arbeid",customer_label:"",note:"",hourly_rate_ore:50000,
 distance_km:0,km_rate_ore:530,toll_ore:0,started_at:second.startedAt,ended_at:second.endedAt,
 duration_minutes:90,work_sessions:[first,second],updated_at:"2026-10-31T11:00:00Z"};
let updated=0;
const mockDB=()=>({from(table){
 assert.equal(table,"work_time_entries");
 return {
  filters:[],payload:null,
  select(fields){assert.ok(fields.includes("work_sessions"));return this;},
  eq(name,val){this.filters.push(["eq",name,val]);return this;},
  is(name,val){this.filters.push(["is",name,val]);return this;},
  update(value){this.payload=value;return this;},
  async maybeSingle(){
   const ok=this.filters.every(([op,name,val])=>
    op==="is"?row[name]===val:String(row[name])===String(val));
   if(!ok)return {data:null,error:null};
   if(this.payload){row={...row,...this.payload};updated++;}
   return {data:{...row},error:null};
  }
 };
}});
const NextResponse={json:(body,opts={})=>({body,status:opts.status||200})};
const PATCH=new Function("NextResponse","sameOriginGuard","getAdminUser","db",
 "isValidDateInput","osloDateKey","accruedWorkMinutes","storedWorkStamps",
 "workStamp","normalizeStampEdit","netWorkMinutes","validDeductedMinutes","parseWorkClockCustomerRef","resolveWorkClockCustomer","console",raw+";return PATCH;")(
 NextResponse,()=>null,async()=>({id:admin,role:"owner"}),mockDB,
 ()=>true,()=>"",()=>0,storedWorkStamps,workStamp,normalizeStampEdit,netWorkMinutes,validDeductedMinutes,parseWorkClockCustomerRef,resolveWorkClockCustomer,{error(){}}
);
const make=payload=>PATCH({json:async()=>({action:"update",id,workDate:"2026-10-30",
 durationMinutes:90,projectLabel:"Diverse arbeid",hourlyRateOre:50000,...payload})});
let response=await make({sessions:[first,{...second,endedAt:"2026-10-31T11:30:00.000Z"}]});
assert.equal(response.status,200);
assert.equal(row.duration_minutes,150,"Server must recompute minutes from stamp times, not trust typed total");
assert.equal(row.work_sessions.length,2);
assert.equal(row.work_sessions[1].minutes,90);
assert.equal(row.work_date,"2026-10-30","Keep row date unless user explicitly changes it");
assert.equal(updated,1);
response=await make({sessions:[first,workStamp("2026-10-30T08:45:00Z","2026-10-30T09:15:00Z")]});
assert.equal(response.status,400,"Overlapping stamps must fail on server");
assert.equal(updated,1);
const client=read("app/admin/arbeidsklokke/WorkClockClient.js");
const styles=read("app/admin/arbeidsklokke/workClock.module.css");
const migration=read("supabase/migrations/20261031150000_work_time_sessions.sql");
assert.ok(raw.includes("work_sessions,created_at"));
assert.ok(raw.includes("work_sessions:[...storedWorkStamps(existing),lastStamp]"),
 "Stopping a clock must append its own new stamp");
assert.ok(client.includes('className={styles.entryNameButton} onClick={()=>openEdit(entry)}'),
 "Tapping the row name opens stamp editor without any linked order");
assert.ok(client.includes('type="datetime-local" value={stamp.startedAt}'));
assert.ok(client.includes('type="datetime-local" value={stamp.endedAt}'));
assert.ok(client.includes("fromOsloDateTimeLocal"),"Convert displayed Norwegian times to UTC safely");
assert.ok(client.includes("stampEditorEnabled"),"History controls remain visible after removing all stamps");
assert.ok(client.includes('＋ Legg til stempling'));
assert.ok(client.includes('Fjern økt'));
assert.ok(styles.includes(".stampEditor")&&styles.includes(".stampLine"));
assert.ok(migration.includes("add column if not exists work_sessions jsonb"));
assert.ok(migration.includes("'historical',true"),"Never invent legacy stamp times");
console.log("Inn-/utstemplinger bestått: 2 økter, Oslo-tid, redigert total, overlapp stoppes, historikk beholdes, samme registrering.");
