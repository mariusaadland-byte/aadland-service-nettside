import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const termSource=readFileSync("lib/invoiceVatTermReport.js","utf8").replace(/^export /gm,"");
const {vatTermBounds}=new Function(termSource+";return {vatTermBounds};")();
const source=readFileSync("lib/invoiceInputVat.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {validateVatPurchaseInput}=new Function("vatTermBounds",source+
 ";return {validateVatPurchaseInput};")(vatTermBounds);
let role="owner",guarded=false,preview=false,writeCount=0,duplicate=false,voidMissing=false;
const db=()=>({from(table){
 assert.equal(table,"vat_purchase_documents");
 const q={
  operation:"",payload:null,
  insert(data){writeCount++;q.operation="insert";q.payload=data;return q;},
  update(data){writeCount++;q.operation="update";q.payload=data;return q;},
  eq(field,val){assert.equal(field,"id");assert.equal(val,"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0404");return q;},
  is(field,val){assert.equal(field,"voided_at");assert.equal(val,null);return q;},
  select(columns){assert.ok(columns.includes("id"));return q;},
  async single(){
   if(duplicate)return {data:null,error:{code:"23505",message:"duplicate key"}};
   assert.equal(q.operation,"insert");assert.equal(q.payload.confirmed_by,"test-owner");
   assert.equal(q.payload.deductible_vat_ore,2500);
   return {data:{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0404"},error:null};
  },
  async maybeSingle(){
   assert.equal(q.operation,"update");
   assert.equal(q.payload.voided_by,"test-owner");
   assert.ok(q.payload.void_reason.length>=8);
   return {data:voidMissing?null:{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0404"},error:null};
  }
 };return q;
}});
const NextResponse={json:(data,opts={})=>({status:opts.status||200,body:data,headers:opts.headers})};
const raw=readFileSync("app/api/admin/invoices/vat-purchases/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const POST=new Function("NextResponse","getAdminUser","db","sameOriginGuard","validateVatPurchaseInput","process",
 raw+";return POST;")(NextResponse,async()=>({role,id:"test-owner"}),db,
 ()=>guarded?{status:403}:null,validateVatPurchaseInput,
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
assert.equal(response.status,409,"Duplicate supplier invoice is rejected");
duplicate=false;
response=await submit({action:"void",id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0404",
 reason:"Dublett korrigert",confirmed:true});
assert.equal(response.status,200);
assert.equal(writeCount,3);
voidMissing=true;
response=await submit({action:"void",id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0404",
 reason:"Andre korreksjon",confirmed:true});
assert.equal(response.status,409);
response=await submit({action:"void",id:"bad",reason:"Lang nok",confirmed:true});
assert.equal(response.status,400);
response=await submit({action:"void",id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0404",
 reason:"",confirmed:true});assert.equal(response.status,400);
assert.equal(writeCount,4);
console.log("Inngående MVA-API bestått: eier, opprinnelsessjekk, testmiljø-sperre, beløpskontroll, dublett, oppheving.");
