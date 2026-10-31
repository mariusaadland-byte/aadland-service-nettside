import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const source=read("lib/workClockCustomer.js").replace(/^export /gm,"");
const {parseWorkClockCustomerRef,resolveWorkClockCustomer}=new Function(source+
 ";return {parseWorkClockCustomerRef,resolveWorkClockCustomer};")();
const contact="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",profile="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const clients={
 admin_customer_contacts:[{id:contact,name:"Kontantkunde Hansen",phone:"98000000"}],
 customer_profiles:[{id:profile,name:"Fast kunde AS",phone:"41000000"}]
};
let broken=false,dbRead=0,created=0;
const db=()=>({from(table){
 assert.ok(["admin_customer_contacts","customer_profiles","work_time_entries"].includes(table));
 return {
  table,ref:"",values:null,
  select(fields){return this;},
  eq(field,val){assert.equal(field,"id");this.ref=val;return this;},
  insert(values){this.values=values;return this;},
  async maybeSingle(){
   dbRead++;
   if(broken)return {data:null,error:{code:"42P01"}};
   return {data:(clients[this.table]||[]).find(x=>x.id===this.ref)||null,error:null};
  },
  async single(){
   assert.equal(this.table,"work_time_entries");
   created++;
   return {data:{...this.values,id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    started_at:this.values.started_at,work_date:this.values.work_date,
    work_sessions:[],deducted_minutes:0,lunch_days:[]},error:null};
  }
 };
}});
assert.equal(parseWorkClockCustomerRef("contact:"+contact).kind,"contact");
assert.equal(parseWorkClockCustomerRef("profile:"+profile).kind,"profile");
assert.equal(parseWorkClockCustomerRef("junk:"+contact).error,"Velg kunden på nytt fra kunderegisteret.");
assert.equal(parseWorkClockCustomerRef("contact:not-valid").error,"Velg kunden på nytt fra kunderegisteret.");
assert.equal(parseWorkClockCustomerRef(""),null);
assert.deepEqual(await resolveWorkClockCustomer(db(),"contact:"+contact),{
 customerRef:"contact:"+contact,customerLabel:"Kontantkunde Hansen"
});
assert.deepEqual(await resolveWorkClockCustomer(db(),"profile:"+profile),{
 customerRef:"profile:"+profile,customerLabel:"Fast kunde AS"
});
assert.match((await resolveWorkClockCustomer(db(),"contact:"+profile)).error,/finnes ikke/);
broken=true;
assert.match((await resolveWorkClockCustomer(db(),"contact:"+contact)).error,/kontrollere/);
broken=false;
const raw=read("app/api/admin/work-time/route.js")
 .replace(/^import .*;\n/gm,"").replace(/^export async function /gm,"async function ");
const stampSource=read("lib/workTimeStamps.js").replace(/^export /gm,"");
const {storedWorkStamps}=new Function(stampSource+";return {storedWorkStamps};")();
const deductionSource=read("lib/workTimeDeduction.js").replace(/^export /gm,"");
const {netWorkMinutes}=new Function(deductionSource+";return {netWorkMinutes};")();
const NextResponse={json:(body,opts={})=>({status:opts.status||200,body})};
let role="owner",seenValues=null;
const POST=new Function("NextResponse","sameOriginGuard","getAdminUser","db","osloDateKey",
 "parseWorkClockCustomerRef","resolveWorkClockCustomer","storedWorkStamps","netWorkMinutes","console",
 raw+";return POST;")(NextResponse,()=>null,
 async()=>role==="owner"?{id:profile,role:"owner"}:null,
 ()=>({from(table){
   if(table!=="work_time_entries"&&table!=="admin_customer_contacts"&&table!=="customer_profiles")
    throw Error("unexpected table "+table);
   const query={
    table,selected:null,ref:null,values:null,
    select(fields){this.selected=fields;return this;},
    eq(field,val){assert.equal(field,"id");this.ref=val;return this;},
    insert(values){this.values=values;seenValues=values;return this;},
    async maybeSingle(){return {data:(clients[table]||[]).find(row=>row.id===this.ref)||null,error:null};},
    async single(){created++;return {data:{
     ...this.values,id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
     work_date:"2026-10-31",created_at:"2026-10-31T12:00:00Z",
     updated_at:"2026-10-31T12:00:00Z"},error:null};}
   };
   return query;
  }}),
 ()=>"2026-10-31",parseWorkClockCustomerRef,resolveWorkClockCustomer,storedWorkStamps,netWorkMinutes,
 {error(){}});
const post=body=>POST({json:async()=>({action:"start",hourlyRateOre:50000,...body})});
let res=await post({orderId:null,customerRef:"contact:"+contact,customerLabel:"Not the right name"});
assert.equal(res.status,200,"Registered cash customer can start the clock without project");
assert.equal(seenValues.customer_ref,"contact:"+contact);
assert.equal(seenValues.customer_label,"Kontantkunde Hansen","Name comes from stored CRM, not request");
assert.equal(seenValues.order_id,null);
assert.equal(res.body.entry.customerRef,"contact:"+contact);
assert.equal(res.body.entry.customerLabel,"Kontantkunde Hansen");
assert.equal(res.body.entry.projectLabel,"");
res=await post({customerRef:"profile:"+profile});
assert.equal(res.status,200,"Registered user customer works as well");
assert.equal(seenValues.customer_label,"Fast kunde AS");
const before=created;
res=await post({orderId:contact,customerRef:"contact:"+contact});
assert.equal(res.status,400,"Never attach a standalone customer selection to a project");
res=await post({customerRef:"contact:invalid"});
assert.equal(res.status,400,"Invalid user-supplied ID must be rejected");
res=await post({customerRef:"contact:"+profile});
assert.equal(res.status,400,"Nonexistent contact must be rejected");
assert.equal(created,before);
res=await post({customerRef:"",customerLabel:"Fritekst-kunde"});
assert.equal(res.status,200,"Old project-free input still supported");
assert.equal(seenValues.customer_ref,"");
assert.equal(seenValues.customer_label,"Fritekst-kunde");
role="guest";res=await post({customerRef:"contact:"+contact});
assert.equal(res.status,403,"Unprivileged users cannot start linked clocks");

const ui=read("app/admin/arbeidsklokke/WorkClockClient.js");
const picker=read("app/admin/arbeidsklokke/WorkClockCustomerPicker.js");
const endpoint=read("app/api/admin/work-time/customers/route.js");
const migration=read("supabase/migrations/20261031230000_work_time_customer_ref.sql");
assert.ok(ui.includes('fetch("/api/admin/work-time/customers"'));
assert.ok(ui.includes('customerRef:timerDraft.customerRef||""'));
assert.ok(ui.includes('customerRef:manual.customerRef||""'));
assert.ok(ui.includes('customerRef:editing.customerRef||""'));
assert.ok(ui.includes('customerRef:entry.customerRef||""'));
assert.ok((ui.match(/<WorkClockCustomerPicker /g)||[]).length>=3);
assert.ok(ui.includes('orderId:"",'));
assert.ok(picker.includes('type="search"')&&picker.includes('Søk på navn eller telefonnummer'));
assert.ok(picker.includes('c.phone')&&picker.includes('setQuery("")'));
assert.ok(picker.includes('c.customerRef===value'));
assert.ok(endpoint.includes('"admin_customer_contacts"')&&endpoint.includes('"customer_profiles"'));
assert.ok(endpoint.includes('user.role!=="owner"&&!user.canUpdateOrders'));
assert.ok(endpoint.includes('"Cache-Control":"private, no-store"'));
assert.ok(migration.includes('customer_ref text not null default'));
assert.ok(migration.includes('customer_ref_idx'));
console.log("Kundevalg på arbeidsklokken bestått: kontantkunde/kundekonto, gyldig ID, ingen prosjektkrav, manuell fallback og sikret kundeoppslag.");
