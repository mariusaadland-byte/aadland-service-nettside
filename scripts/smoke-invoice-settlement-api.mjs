import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Only mocked Supabase reads. No actual invoices, refunds or emails.
const authInvoice={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001",status:"issued",
 invoice_number:"AS-WEB-2026-000101",paid_ore:80000,credited_ore:20000,
 customer:{name:"Demo"},line_items:[{description:"Arbeid",quantity:1,unitPriceOre:80000,vatRate:25}]};
const draftInvoice={...authInvoice,id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002",status:"draft"};
let role="owner",readError=false;
const accessed=[],writes=[];
const db=()=>({from(table){
 let ids=null;
 return {
  select(){return this;},
  order(){return this;},
  in(field,values){assert.equal(field,"invoice_id");ids=values;return this;},
  async range(){
   accessed.push({table,ids});
   if(table==="invoice_drafts")return {data:[authInvoice,draftInvoice],error:null};
   if(table==="invoice_vipps_payments"){
    if(readError)return {data:null,error:{message:"temporary unavailable"}};
    assert.deepEqual(ids,[authInvoice.id],"Draft is never used for settlement aggregation");
    return {data:[{id:"a",invoice_id:authInvoice.id,state:"partial",captured_ore:100000,refunded_ore:20000}],error:null};
   }
   if(table==="invoice_credit_notes")
    return {data:[{id:"b",invoice_id:authInvoice.id,total_ore:20000,sent_at:"2026-10-24T10:00:00Z"}],error:null};
   throw Error("Unexpected table "+table);
  },
  insert(){writes.push("insert");throw Error("Read-only API must not write");},
  update(){writes.push("update");throw Error("Read-only API must not write");}
 };
}});
const helper=readFileSync("lib/invoiceSettlementInfo.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const summarize=new Function(helper+";return summarizeInvoiceActivity;")();
const api=readFileSync("app/api/admin/invoices/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export async function /gm,"async function ");
const NextResponse={json(data,opts={}){return {status:opts.status||200,body:data,headers:opts.headers}}};
const GET=new Function("NextResponse","getAdminUser","db","withInvoicePaymentTerms",
 "osloDateKey","summarizeInvoiceActivity",
 api+";return GET;")(
 NextResponse,async()=>({role}),db,i=>i,()=> "2026-10-24",summarize);
let result=await GET();
assert.equal(result.status,200);
assert.equal(result.headers["Cache-Control"],"private, no-store");
assert.equal(result.body.invoices.length,2);
const item=result.body.invoices.find(i=>i.status==="issued");
assert.equal(item.activity.vippsCapturedOre,100000);
assert.equal(item.activity.vippsRefundedOre,20000);
assert.equal(item.activity.creditDocumentsOre,20000);
assert.equal(item.activity.creditNoteCount,1);
assert.equal(item.activity.creditNoteSentCount,1);
assert.equal(writes.length,0,"Archive API only reads");
readError=true;
result=await GET();
assert.equal(result.status,503,"Do not present incomplete refund history as a zero refund");
role="guest";
result=await GET();
assert.equal(result.status,403);
assert.equal(writes.length,0);
console.log("Fakturaoppgjør API bestått: kun administrator, ekte aggregerte beløp, lesetilgang og tydelig feil når historikk mangler.");
