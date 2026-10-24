import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// All database actions are stubbed. Never change an actual invoice from smoke tests.
const original="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0092";
const request="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0092";
let role="owner",guarded=false,dbError=false,remoteClosed=false,writeCount=0;
const closureEvents=[];
const invoiceDb=()=>({
 from(table){
  const query={
   select(){return query;},eq(){return query;},
   async maybeSingle(){
    if(dbError)return {data:null,error:{message:"DB failure"}};
    return {data:remoteClosed?{invoice_id:original,closed_at:"2026-10-24T16:00:00Z",revision:1}:null,error:null};
   },
   order(){return query;},
   async limit(){return {data:closureEvents,error:dbError?{message:"DB failure"}:null};}
  };
  return query;
 },
 async rpc(name,args){
  writeCount++;
  assert.equal(name,"set_invoice_admin_closure");
  assert.equal(args.p_invoice_id,original);
  assert.equal(args.p_request_id,request);
  assert.equal(args.p_expected_paid_ore,12500);
  assert.equal(args.p_expected_credited_ore,0);
  assert.equal(args.p_expected_outstanding_ore,0);
  assert.equal(args.p_actor_id,"owner-test-id");
  remoteClosed=args.p_action==="close";
  closureEvents.unshift({id:request,action:args.p_action,note:args.p_reason});
  return {data:{closed:remoteClosed,revision:1,alreadyApplied:false},error:null};
 }
});
const NextResponse={json:(data,{status=200,headers={}}={})=>({status,body:data,headers})};
const raw=readFileSync("app/api/admin/invoices/closures/route.js","utf8")
 .replace(/^import .*;\n/gm,"")
 .replace(/^export const /gm,"const ")
 .replace(/^export async function /gm,"async function ");
const f=new Function("NextResponse","getAdminUser","db","sameOriginGuard","process",
 raw+";return {GET,POST};");
const {GET,POST}=f(NextResponse,async()=>({role,id:"owner-test-id"}),
 invoiceDb,()=>guarded?{status:403}:null,{env:{VERCEL_ENV:"production"}});
const get=()=>GET({url:"https://localhost/api/admin/invoices/closures?invoiceId="+original});
const send=(action="close",payload={})=>POST({
 json:async()=>({invoiceId:original,requestId:request,action,
  note:"Innbetalingene og kreditnotaene er kontrollert.",confirmed:true,
  expectedPaidOre:12500,expectedCreditedOre:0,expectedOutstandingOre:0,...payload})
});
let result=await get();
assert.equal(result.status,200);
assert.equal(result.body.canManage,true);
assert.equal(result.body.closure,null);
assert.equal(result.headers["Cache-Control"],"private, no-store");
result=await send();
assert.equal(result.status,200);
assert.equal(result.body.closed,true);
assert.equal(writeCount,1);
result=await get();
assert.equal(result.body.closure.closed_at,"2026-10-24T16:00:00Z");
assert.equal(result.body.events.length,1);
result=await send("reopen");
assert.equal(result.status,200);
assert.equal(result.body.closed,false);
assert.equal(writeCount,2);
role="staff";
result=await get();
assert.equal(result.status,200);
assert.equal(result.body.canManage,false);
result=await send();
assert.equal(result.status,403);
assert.equal(writeCount,2);
role="guest";
result=await get();
assert.equal(result.status,403);
role="owner";guarded=true;
result=await send();
assert.equal(result.status,403);
guarded=false;
result=await send("close",{confirmed:false});
assert.equal(result.status,400);
result=await send("close",{expectedPaidOre:-1});
assert.equal(result.status,400);
result=await send("close",{note:"bad"});
assert.equal(result.status,400);
result=await get();
assert.equal(result.status,200);
dbError=true;
result=await get();
assert.equal(result.status,503,"An unavailable closure DB must fail closed");
dbError=false;
assert.equal(writeCount,2,"Invalid and unauthorized requests cannot change admin state");

const client=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
const panel=readFileSync("app/admin/faktura/InvoiceClosurePanel.js","utf8");
const summary=readFileSync("app/admin/faktura/InvoiceFollowUpDashboard.js","utf8");
const main=readFileSync("app/api/admin/invoices/route.js","utf8");
const migration=readFileSync("supabase/migrations/20261024201500_invoice_admin_closures.sql","utf8");
assert.ok(client.includes("<InvoiceClosurePanel"));
assert.ok(client.includes('value="closed"'));
assert.ok(summary.includes('key:"closed"'));
assert.ok(panel.includes("Avslutt faktura"));
assert.ok(panel.includes("Åpne faktura igjen"));
assert.ok(panel.includes('window.prompt("Skriv "+verb'));
assert.ok(panel.includes("Jeg har kontrollert at fakturaen"));
assert.ok(main.includes("invoice_admin_closures"));
assert.ok(main.includes("Administrativ avslutningsstatus kunne ikke hentes."));
assert.ok(migration.includes("for update")&&migration.includes("p_expected_outstanding_ore"));
assert.ok(migration.includes("vipps_net<>vipps_in_ledger"));
assert.ok(migration.includes("trigger reopen_invoice_after_ledger_change"));
assert.ok(migration.includes("invoice_admin_closure_events"));
assert.ok(migration.includes("enable row level security"));
assert.ok(!migration.includes("update public.invoice_drafts set status="),
 "Never overwrite legally issued invoice status");
console.log("Administrativ fakturaavslutning bestått: eierbekreftelse, gjenåpning, revisjoner, rettigheter, manglende data og låst økonomisk historikk.");
