import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const vat=readFileSync("lib/invoiceVatTermReport.js","utf8").replace(/^export /gm,"");
const {vatTermBounds}=new Function(vat+";return {vatTermBounds};")();
const inputRaw=readFileSync("lib/invoiceInputVat.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {validateVatPurchaseInput}=new Function("vatTermBounds",inputRaw+";return {validateVatPurchaseInput};")(vatTermBounds);
const importRaw=readFileSync("lib/vatPurchaseCsvImport.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {inspectVatImportRows,MAX_VAT_IMPORT_ROWS}=new Function("validateVatPurchaseInput",importRaw+
 ";return {inspectVatImportRows,MAX_VAT_IMPORT_ROWS};")(validateVatPurchaseInput);
let role="owner",guard=false,hasDb=true,dbFailed=false,queryCount=0,writes=0,tooMany=false;
const records=[{
 id:"existing",supplier_name:"Megaflis",supplier_document_number:"INV-11",
 kind:"purchase",document_date:"2026-10-24",base_ore:10000,vat_ore:2500,
 deductible_vat_ore:2500,voided_at:null
}];
const db=()=>hasDb?{from(table){
 assert.equal(table,"vat_purchase_documents");
 const q={
  select(){return q;},is(k,v){assert.equal(k,"voided_at");assert.equal(v,null);return q;},
  order(){return q;},
  async range(start,end){
   queryCount++;
   if(dbFailed)return {error:{message:"DB down"},data:null};
   if(tooMany)return {data:Array(500).fill(records[0]),error:null};
   return {data:records.slice(start,end+1),error:null};
  },
  insert(){writes++;throw Error("Read-only endpoint must not write")},
  update(){writes++;throw Error("Read-only endpoint must not update")}
 };return q;
}}:null;
const NextResponse={json:(data,{status=200,headers={}}={})=>({status,body:data,headers})};
const raw=readFileSync("app/api/admin/invoices/vat-import/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const POST=new Function("NextResponse","getAdminUser","db","sameOriginGuard","inspectVatImportRows",
 "MAX_VAT_IMPORT_ROWS",raw+";return POST;")(
 NextResponse,async()=>({role}),db,()=>guard?{status:403,body:{error:"origin"}}:null,
 inspectVatImportRows,MAX_VAT_IMPORT_ROWS
);
const row=(supplier,number)=>({
 supplierName:supplier,documentNumber:number,documentDate:"2026-10-25",kind:"purchase",
 evidenceReference:"Regnskap bilag 11",businessPurpose:"Materialer til et kundeoppdrag",
 deductionPercent:100,groups:{25:{base:"100,00",vat:"25,00"}},
 documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false
});
const submit=body=>POST({headers:{get:()=>String(JSON.stringify(body).length)},
 json:async()=>body});
let result=await submit({action:"preview",rows:[row("Megaflis","INV-11"),row("Nytt Firma","INV-12")]});
assert.equal(result.status,200);
assert.equal(result.headers["Cache-Control"],"private, no-store");
assert.equal(result.body.counts.existing,0,"Amount or date conflict must not be silently treated as duplicate");
assert.equal(result.body.counts.conflict,1);
assert.equal(result.body.counts.new,1);
assert.ok(!JSON.stringify(result.body).includes("businessPurpose"));
assert.equal(writes,0);
role="staff";
result=await submit({action:"preview",rows:[row("Nytt Firma","INV-12")]});
assert.equal(result.status,403);
role="owner";guard=true;
result=await submit({action:"preview",rows:[row("Nytt Firma","INV-12")]});
assert.equal(result.status,403);
guard=false;
result=await submit({action:"import",rows:[row("Nytt Firma","INV-12")]});
assert.equal(result.status,400,"Preview route cannot import");
result=await submit({action:"preview",rows:Array(51).fill(row("Nytt Firma","INV-12"))});
assert.equal(result.status,400);
hasDb=false;
result=await submit({action:"preview",rows:[row("Nytt Firma","INV-12")]});
assert.equal(result.status,503);
hasDb=true;dbFailed=true;
result=await submit({action:"preview",rows:[row("Nytt Firma","INV-12")]});
assert.equal(result.status,503,"Never claim new documents if DB is down");
dbFailed=false;tooMany=true;
result=await submit({action:"preview",rows:[row("Nytt Firma","INV-12")]});
assert.equal(result.status,503,"Overlong duplicate lookup must fail closed");
assert.equal(writes,0);
assert.ok(queryCount>=1);
console.log("Importforhåndsvisning-API bestått: eiertilgang, samme opprinnelse, full duplikatsjekk, feil og ingen skriving.");
