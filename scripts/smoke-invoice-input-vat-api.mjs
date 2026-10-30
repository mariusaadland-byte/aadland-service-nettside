import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const termSource=readFileSync("lib/invoiceVatTermReport.js","utf8").replace(/^export /gm,"");
const {vatTermBounds}=new Function(termSource+";return {vatTermBounds};")();
const source=readFileSync("lib/invoiceInputVat.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {validateVatPurchaseInput}=new Function("vatTermBounds",source+
 ";return {validateVatPurchaseInput};")(vatTermBounds);
const helper=readFileSync("lib/vatPurchaseDuplicateCheck.js","utf8").replace(/^export /gm,"");
const {checkVatPurchaseDuplicate,vatDuplicateKey}=new Function(helper+
 ";return {checkVatPurchaseDuplicate,vatDuplicateKey};")();
let role="owner",guarded=false,preview=false,writeCount=0,readCount=0,
 duplicate=false,voidMissing=false,dbError=false,existing=[];
const documentId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0404";
const existingId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const db=()=>({from(table){
 assert.equal(table,"vat_purchase_documents");
 const q={
  operation:"",payload:null,
  insert(data){writeCount++;q.operation="insert";q.payload=data;return q;},
  update(data){writeCount++;q.operation="update";q.payload=data;return q;},
  eq(field,val){assert.equal(field,"id");assert.equal(val,documentId);return q;},
  is(field,val){assert.equal(field,"voided_at");assert.equal(val,null);return q;},
  order(field){assert.equal(field,"id");return q;},
  async range(from,to){readCount++;return dbError
   ?{data:null,error:{message:"Database error"}}
   :{data:existing.filter(row=>!row.voided_at).slice(from,to+1),error:null};},
  select(columns){assert.ok(columns.includes("id"));return q;},
  async single(){
   assert.equal(q.operation,"insert","Must never write after preflight rejection");
   if(duplicate)return {data:null,error:{code:"23505",message:"duplicate key"}};
   assert.equal(q.payload.confirmed_by,"test-owner");
   assert.equal(q.payload.deductible_vat_ore,2500);
   return {data:{id:documentId},error:null};
  },
  async maybeSingle(){
   assert.equal(q.operation,"update");
   assert.equal(q.payload.voided_by,"test-owner");
   assert.ok(q.payload.void_reason.length>=8);
   return {data:voidMissing?null:{id:documentId},error:null};
  }
 };return q;
}});
const NextResponse={json:(data,opts={})=>({status:opts.status||200,body:data,headers:opts.headers})};
const raw=readFileSync("app/api/admin/invoices/vat-purchases/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const POST=new Function("NextResponse","getAdminUser","db","sameOriginGuard","validateVatPurchaseInput",
 "checkVatPurchaseDuplicate","vatDuplicateKey","process",
 raw+";return POST;")(NextResponse,async()=>role==="owner"?{role,id:"test-owner"}:{role,id:"test-guest"},
 db,()=>guarded?{status:403}:null,validateVatPurchaseInput,checkVatPurchaseDuplicate,vatDuplicateKey,
 {env:{get VERCEL_ENV(){return preview?"preview":"production";}}});
const body={
 action:"register",supplierName:"Byggern",documentNumber:"INV-123",
 documentDate:"2026-10-24",kind:"purchase",evidenceReference:"Systemia 123",
 businessPurpose:"Materialer til kundeoppdrag",deductionPercent:100,
 groups:{25:{base:"100,00",vat:"25,00"}},
 documentConfirmed:true,deductionConfirmed:true,bankConditionConfirmed:false
};
const submit=payload=>POST({json:async()=>payload,url:"https://localhost/api/admin/invoices/vat-purchases"});
let response=await submit(body);
assert.equal(response.status,201);
assert.equal(writeCount,1);
assert.equal(readCount,1,"Every registration must read the active ledger");
assert.equal(response.headers["Cache-Control"],"private, no-store");
role="guest";
response=await submit(body);assert.equal(response.status,403);
role="owner";guarded=true;
response=await submit(body);assert.equal(response.status,403);
guarded=false;preview=true;
response=await submit(body);assert.equal(response.status,403);
preview=false;
response=await submit({...body,documentConfirmed:false});assert.equal(response.status,400);
assert.equal(writeCount,1);
duplicate=true;
response=await submit(body);
assert.equal(response.status,409,"Database unique constraint must still block simultaneous exact duplicates");
duplicate=false;
const prior={id:existingId,supplier_name:"Byggern",supplier_document_number:"INV-123",
 document_date:"2026-10-23",kind:"purchase",base_ore:10000,vat_ore:2500,voided_at:null};
existing=[prior];
const before=writeCount;
response=await submit(body);
assert.equal(response.status,409,"Exact duplicate must be rejected before INSERT");
assert.equal(response.body.duplicate.status,"duplicate");
assert.equal(writeCount,before);
response=await submit({...body,possibleDuplicateReviewed:true,possibleDuplicateMatchId:existingId});
assert.equal(response.status,409,"Exact duplicates are never overridable");
assert.equal(writeCount,before);
existing=[{...prior,supplier_document_number:"INV 123"}];
response=await submit(body);
assert.equal(response.status,409,"OCR punctuation variation needs server confirmation");
assert.equal(response.body.duplicate.status,"possible");
assert.equal(writeCount,before);
response=await submit({...body,possibleDuplicateReviewed:true,possibleDuplicateMatchId:documentId});
assert.equal(response.status,409,"An approval for a different old invoice must not be accepted");
assert.equal(writeCount,before);
response=await submit({...body,possibleDuplicateReviewed:true,possibleDuplicateMatchId:existingId});
assert.equal(response.status,201,"Confirmed specific similar invoice can be registered if truly distinct");
assert.equal(writeCount,before+1);
existing=[{...prior,supplier_name:"Other Supplier AS"}];
response=await submit(body);
assert.equal(response.status,409,"Same number from different supplier needs review");
response=await submit({...body,possibleDuplicateReviewed:true,possibleDuplicateMatchId:existingId});
assert.equal(response.status,201,"Other supplier may reuse same invoice number after review");
existing=[{...prior,voided_at:"2026-10-29T10:00:00Z"}];
response=await submit(body);
assert.equal(response.status,201,"Voided invoices do not prevent a new registration");
existing=[];dbError=true;
const beforeError=writeCount;
response=await submit(body);
assert.equal(response.status,503,"Database error must never allow saving without duplicate check");
assert.equal(writeCount,beforeError);
dbError=false;
const beforeVoid=writeCount;
response=await submit({action:"void",id:documentId,reason:"Dublett korrigert",confirmed:true});
assert.equal(response.status,200);
assert.equal(writeCount,beforeVoid+1);
voidMissing=true;
response=await submit({action:"void",id:documentId,reason:"Andre korreksjon",confirmed:true});
assert.equal(response.status,409);
response=await submit({action:"void",id:"bad",reason:"Lang nok",confirmed:true});
assert.equal(response.status,400);
response=await submit({action:"void",id:documentId,reason:"",confirmed:true});
assert.equal(response.status,400);
assert.equal(writeCount,beforeVoid+2);
console.log("Inngående MVA-API bestått: eier, opprinnelse, preview, eksakt dublett, OCR-variant, bekreftet treff-ID, bank/datafeil og oppheving.");
