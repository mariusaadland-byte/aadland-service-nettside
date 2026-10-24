import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const invoiceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const pdfSecret="NOT_A_PUBLIC_PDF";
const original={id:invoiceId,status:"issued",invoice_number:"AS-WEB-TEST",issued_at:"2026-10-21T10:00:00Z"};
let role="owner",readFailure=false,limitError=false,reads=[],writes=0;
const records={
 invoice_payments:[{id:"ledger-1",amount_ore:15000,recorded_at:"2026-10-22T11:00:00Z",paid_on:"2026-10-22"}],
 invoice_vipps_payments:[{id:"payment-1",refunded_ore:5000,created_at:"2026-10-22T09:00:00Z"}],
 invoice_vipps_refund_notices:[{id:"refund-1",payment_id:"payment-1",refunded_delta_ore:5000,created_at:"2026-10-23T10:00:00Z"}],
 invoice_credit_notes:[{id:"credit-1",total_ore:1000,credit_number:"AS-KN-TEST",issued_at:"2026-10-23T09:00:00Z"}],
 invoice_reminder_sends:[{id:"reminder-1",kind:"purring",status:"sent",sent_at:"2026-10-23T08:00:00Z",pdf_base64:pdfSecret}]
};
const db=()=>({from(table){
 const q={
  select(fields){reads.push({table,fields});return q;},
  eq(k,value){assert.equal(k,"id"===k?"id":"invoice_id");assert.equal(value,invoiceId);return q;},
  async maybeSingle(){assert.equal(table,"invoice_drafts");return {data:original,error:null}},
  async limit(count){
   assert.equal(count,501);
   if(readFailure&&table==="invoice_payments")return {data:null,error:{message:"Not available"}};
   if(limitError&&table==="invoice_credit_notes")return {data:Array(501).fill({}),error:null};
   return {data:records[table],error:null};
  },
  update(){writes++;throw Error("Timeline is read only");},
  insert(){writes++;throw Error("Timeline is read only");}
 };return q;
}});
const source=readFileSync("lib/invoiceActivityTimeline.js","utf8").replace(/^export /gm,"");
const build=new Function(source+";return buildInvoiceActivityTimeline;")();
const route=readFileSync("app/api/admin/invoices/activity/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const NextResponse={json:(data,opts={})=>({status:opts.status||200,data,headers:opts.headers||{}})};
const GET=new Function("getAdminUser","db","NextResponse","buildInvoiceActivityTimeline",route+";return GET;")(
 async()=>({role}),db,NextResponse,build
);
const call=id=>GET({url:"https://localhost/api/admin/invoices/activity?invoiceId="+id});
let r=await call(invoiceId);
assert.equal(r.status,200);
assert.equal(r.headers["Cache-Control"],"private, no-store");
assert.ok(r.data.events.some(e=>e.kind==="payment"));
assert.ok(r.data.events.some(e=>e.kind==="refund"));
assert.ok(r.data.events.some(e=>e.kind==="credit"));
assert.ok(r.data.events.some(e=>e.kind==="reminder"));
assert.ok(!JSON.stringify(r.data).includes(pdfSecret),"Never leak stored PDF bytes in timeline API");
assert.equal(writes,0);
assert.equal(reads.length,6,"Each source read just once");
reads=[];readFailure=true;r=await call(invoiceId);
assert.equal(r.status,503,"No misleading partial results on query failure");
readFailure=false;limitError=true;r=await call(invoiceId);
assert.equal(r.status,503,"Truncated event sources must fail closed");
limitError=false;role="none";r=await call(invoiceId);
assert.equal(r.status,403,"No timeline for unauthorized users");
r=await call("invalid");assert.equal(r.status,403);
assert.equal(writes,0);
console.log("Faktura-tidslinje API bestått: rettigheter, betalingskilder, PDF-personvern, ingen skriving og fail-closed.");
