import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const helperSource=read("lib/workTimeAccumulation.js").replace(/^export /gm,"");
const {accruedWorkMinutes,combinedWorkClockText}=new Function(helperSource+
 ";return {accruedWorkMinutes,combinedWorkClockText};")();
const begin="2026-10-31T08:00:00.000Z",end="2026-10-31T08:30:00.000Z";
assert.equal(accruedWorkMinutes(120,begin,end),150,
 "New time must be ADDED to the 2 hours already saved");
assert.equal(accruedWorkMinutes(0,begin,end),30);
assert.equal(accruedWorkMinutes(100000,begin,end),null,
 "Never silently overflow the database's maximum of 100000 minutes");
assert.equal(accruedWorkMinutes(120,end,begin),null,
 "Reject invalid backward elapsed times");
assert.equal(combinedWorkClockText(120,begin,new Date(end).getTime()),"02:30:00",
 "The visible timer must show both saved and currently running time");
assert.equal(combinedWorkClockText(0,begin,new Date(begin).getTime()),"00:00:00");

const stampSource=read("lib/workTimeStamps.js").replace(/^export /gm,"");
const {storedWorkStamps,workStamp,normalizeStampEdit}=new Function(stampSource+
 ";return {storedWorkStamps,workStamp,normalizeStampEdit};")();
const workDeductionSource=read("lib/workTimeDeduction.js").replace(/^export /gm,"");
const {netWorkMinutes,validDeductedMinutes}=new Function(workDeductionSource+
 ";return {netWorkMinutes,validDeductedMinutes};")();
const customerSource=read("lib/workClockCustomer.js").replace(/^export /gm,"");
const {parseWorkClockCustomerRef,resolveWorkClockCustomer}=new Function(customerSource+
 ";return {parseWorkClockCustomerRef,resolveWorkClockCustomer};")();
const raw=read("app/api/admin/work-time/route.js")
 .replace(/^import .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const SELECT_FIELD_NAMES="id,admin_user_id,order_id,work_date,project_label,customer_label,note,started_at,ended_at,duration_minutes,hourly_rate_ore,distance_km,km_rate_ore,toll_ore,created_at,updated_at";
const userId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const entryId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orderId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const base=()=>({id:entryId,admin_user_id:userId,order_id:null,work_date:"2026-10-03",
 project_label:"Arbeid uten prosjekt",customer_label:"Fast kunde",note:"Diverse arbeid",
 started_at:begin,ended_at:end,duration_minutes:120,hourly_rate_ore:50000,
 distance_km:12.5,km_rate_ore:530,toll_ore:900,created_at:"2026-10-03T07:55:00Z",
 updated_at:end});
let record=base(),otherActive=false,stale=false,writes=0,roleOK=true;
const db=()=>({from(name){
 assert.equal(name,"work_time_entries");
 return {
  filters:[],updateValues:null,
  select(fields){assert.ok(fields.includes("id"));return this;},
  eq(field,value){this.filters.push([field,"eq",value]);return this;},
  is(field,value){this.filters.push([field,"is",value]);return this;},
  update(values){this.updateValues=values;return this;},
  async maybeSingle(){
   const matches=this.filters.every(([field,op,value])=>
    op==="is"?record[field]===value:String(record[field])===String(value));
   if(!matches)return {data:null,error:null};
   if(!this.updateValues)return {data:{...record},error:null};
   if(stale){stale=false;return {data:null,error:null};}
   if(this.updateValues.ended_at===null&&otherActive)
    return {data:null,error:{code:"23505",message:"unique active timer"}};
   record={...record,...this.updateValues};writes++;
   return {data:{...record},error:null};
  }
 };
}});
const NextResponse={json:(data,opts={})=>({status:opts.status||200,body:data})};
const PATCH=new Function("NextResponse","sameOriginGuard","getAdminUser","db","isValidDateInput",
 "osloDateKey","accruedWorkMinutes","storedWorkStamps","workStamp","normalizeStampEdit","netWorkMinutes","validDeductedMinutes","parseWorkClockCustomerRef","resolveWorkClockCustomer","console",raw+";return PATCH;")(
 NextResponse,()=>null,async()=>roleOK?{id:userId,role:"owner"}:null,db,
 ()=>true,()=>"",accruedWorkMinutes,storedWorkStamps,workStamp,normalizeStampEdit,netWorkMinutes,validDeductedMinutes,parseWorkClockCustomerRef,resolveWorkClockCustomer,{error(){}}
);
const invoke=(action,id=entryId)=>PATCH({json:async()=>({action,id})});
let response=await invoke("resume");
assert.equal(response.status,200);
assert.equal(response.body.entry.id,entryId,"Must reopen the ORIGINAL row");
assert.equal(writes,1,"Resume must UPDATE, not create a second entry");
assert.equal(record.ended_at,null);
assert.equal(record.duration_minutes,120,"The prior hours must remain banked");
assert.equal(record.work_date,"2026-10-03","Keep the original date for a single aggregated row");
assert.equal(record.project_label,"Arbeid uten prosjekt");
assert.equal(record.hourly_rate_ore,50000);
assert.equal(record.distance_km,12.5);
assert.equal(record.toll_ore,900);
assert.ok(new Date(record.started_at).getTime()>new Date(end).getTime());
response=await invoke("resume");
assert.equal(response.status,409,"Cannot resume a running clock");
assert.equal(writes,1);
response=await invoke("stop");
assert.equal(response.status,200);
assert.ok(record.duration_minutes>=121,"Stop must ADD to previous minutes");
assert.ok(record.ended_at,"Finished clock now has end time");
assert.ok(record.work_sessions?.length>=2,
 "Stopping a resumed timer must retain the previous interval and append the new stamp");
assert.equal(record.work_sessions.reduce((sum,x)=>sum+x.minutes,0),record.duration_minutes);
assert.equal(writes,2);
response=await invoke("stop");
assert.equal(response.status,409,"A repeated stop must never double-count");
assert.equal(writes,2);
record=base();otherActive=true;
response=await invoke("resume");
assert.equal(response.status,409,"Never run 2 clocks concurrently");
assert.equal(record.ended_at,end);
assert.equal(writes,2);
otherActive=false;record={...base(),order_id:orderId};
response=await invoke("resume");
assert.equal(response.status,409,"Only timers without linked orders may resume");
record={...base(),started_at:null,ended_at:null};
response=await invoke("resume");
assert.equal(response.status,409,"Manual entries are not prior stopped clocks");
record=base();stale=true;
response=await invoke("resume");
assert.equal(response.status,409,"A concurrent edit must not be overwritten by stale resume");
assert.equal(record.ended_at,end);
roleOK=false;
response=await invoke("resume");
assert.equal(response.status,403,"Work clock operations remain owner/allowed-only");
roleOK=true;
response=await invoke("resume","not-an-id");
assert.equal(response.status,400);
const client=read("app/admin/arbeidsklokke/WorkClockClient.js");
const css=read("app/admin/arbeidsklokke/workClock.module.css");
assert.ok(client.includes('action:"resume",id:entry.id'));
assert.ok(client.includes('if(busy||active||entry.orderId||!entry.startedAt||!entry.endedAt)return;'));
assert.ok(client.includes('setActive(data.entry)'),"Show the reopened timer as active");
assert.ok(client.includes("clockAfterDeduction(active.durationMinutes,active.startedAt,now,active.deductedMinutes)"),
 "Display the accumulated time as soon as the row is resumed");
assert.ok(client.includes("!activeRow&&!entry.orderId&&Boolean(entry.startedAt&&entry.endedAt)"),
 "Show Fortsett only on stopped standalone clocks");
assert.ok(client.includes('disabled={busy||Boolean(active)}'),
 "Block resume while another clock is running");
assert.ok(client.includes('onClick={()=>resume(entry)}>▶ Fortsett'));
assert.ok(client.includes('setEntries(current=>current.map(item=>item.id===data.entry.id?data.entry:item))'),
 "Do not add another row to the timesheet");
assert.ok(css.includes(".resumeButton")&&css.includes(".entryActions"));
assert.ok(raw.includes('mutation=mutation.eq("ended_at",existing.ended_at)'),
 "Use optimistic concurrency on resume");
assert.ok(raw.includes('mutation=mutation.is("ended_at",null).eq("started_at",existing.started_at)'),
 "Use optimistic concurrency on stop");
assert.ok(raw.includes('String(error.code||"")==="23505"'),
 "Keep the existing unique-index safety against two concurrent clocks");
console.log("Frittstående timere kan fortsettes: samme rad, tidligere tid beholdt, ny tid lagt til, ett aktivt ur, samtidighetssperre og ingen endring av koblede oppdrag.");
