import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const helper=read("lib/vatPurchaseDuplicateCheck.js").replace(/^export /gm,"");
const {checkVatPurchaseDuplicate,vatDuplicateKey,vatDuplicateIdentity}=
 new Function(helper+";return {checkVatPurchaseDuplicate,vatDuplicateKey,vatDuplicateIdentity};")();
const existing=[
 {id:"old",supplier_name:"E.A. Smith AS",supplier_document_number:"260262706",document_date:"2026-09-14",kind:"purchase",voided_at:null},
 {id:"other-supplier",supplier_name:"Megaflis AS",supplier_document_number:"INV-100",document_date:"2026-08-18",kind:"purchase",voided_at:null},
 {id:"old-credit",supplier_name:"E.A. Smith AS",supplier_document_number:"KN-44",document_date:"2026-09-20",kind:"credit",voided_at:null},
 {id:"void",supplier_name:"Jula",supplier_document_number:"345",document_date:"2026-07-02",kind:"purchase",voided_at:"2026-09-01T11:00:00Z"}
];
const lookup=(supplierName,documentNumber,kind="purchase",rows=existing)=>
 checkVatPurchaseDuplicate({supplierName,documentNumber,kind},rows);
assert.equal(lookup(" E.A. SMITH as ","260262706").status,"duplicate",
 "Must find already registered supplier invoices across any MVA term");
assert.equal(lookup("E.A. Smith AS"," 260262706 ").match.documentDate,"2026-09-14");
assert.equal(lookup("E.A. Smith AS","260262706","credit").status,"possible",
 "A credit note sharing the invoice number needs review, not a false definite duplicate");
assert.equal(lookup("Bygger'n Os Vest","260262706").status,"possible",
 "Alternate trading name with same number must be prominently flagged");
assert.equal(lookup("Megaflis AS","INV-100").status,"duplicate");
assert.equal(lookup("Another Supplier","INV-100").status,"possible",
 "Two unrelated suppliers can legitimately use same number");
assert.equal(lookup("Jula","345").status,"clear",
 "Voided documents do not count as active duplicates");
assert.equal(lookup("E.A. Smith AS","260262707").status,"clear");
assert.equal(lookup("","260262706").status,"idle");
assert.equal(lookup("E.A. Smith AS","").status,"idle");
assert.equal(vatDuplicateIdentity("  E.A.   SMITH AS  "),"e.a. smith as");
assert.equal(vatDuplicateKey({supplierName:"E.A. Smith AS",documentNumber:"260262706",kind:"purchase"}),
 vatDuplicateKey({supplierName:" e.a. smith AS ",documentNumber:" 260262706 ",kind:"purchase"}));

const route=read("app/api/admin/invoices/vat-purchases/route.js");
const raw=route.replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
let owner=true,dbError=false,records=existing,readCount=0;
const db=()=>({from(name){
 assert.equal(name,"vat_purchase_documents");
 return {
  select(columns){assert.ok(columns.includes("supplier_document_number"));return this;},
  is(field,value){assert.equal(field,"voided_at");assert.equal(value,null);return this;},
  order(field){assert.equal(field,"id");return this;},
  async range(start,end){
   readCount++;
   return dbError?{data:null,error:{message:"database offline"}}:
    {data:records.filter(x=>!x.voided_at).slice(start,end+1),error:null};
  }
 };
}});
const NextResponse={json:(data,opts={})=>({status:opts.status||200,body:data,headers:opts.headers})};
const GET=new Function("NextResponse","getAdminUser","db","sameOriginGuard",
 "validateVatPurchaseInput","checkVatPurchaseDuplicate","vatDuplicateKey","process",
 raw+";return GET;")(NextResponse,async()=>owner?{role:"owner"}:{role:"user"},
 db,()=>null,()=>{},checkVatPurchaseDuplicate,vatDuplicateKey,{env:{VERCEL_ENV:"production"}});
const request=(supplierName,documentNumber,kind="purchase")=>({
 url:"https://example.test/api/admin/invoices/vat-purchases?"+new URLSearchParams({supplierName,documentNumber,kind})
});
let res=await GET(request("E.A. Smith AS","260262706"));
assert.equal(res.status,200);
assert.equal(res.body.status,"duplicate");
assert.equal(res.body.match.documentDate,"2026-09-14");
assert.equal(res.headers["Cache-Control"],"private, no-store");
res=await GET(request("Byggern Os Vest","260262706"));
assert.equal(res.body.status,"possible");
res=await GET(request("Jula","345"));assert.equal(res.body.status,"clear");
owner=false;res=await GET(request("E.A. Smith AS","260262706"));assert.equal(res.status,403);
owner=true;dbError=true;
res=await GET(request("E.A. Smith AS","260262706"));assert.equal(res.status,503,
 "Database error must NEVER claim invoice is new");
dbError=false;
res=await GET(request("E.A. Smith AS",""));assert.equal(res.status,400);
assert.ok(readCount>=4);
const form=read("app/admin/faktura/mva/InputVatRegisterClient.js");
const css=read("app/admin/faktura/mva/VatSimpleForm.module.css");
const schema=read("supabase/migrations/20261024222000_vat_purchase_documents.sql");
assert.ok(schema.includes("vat_purchase_document_active_unique"),
 "The database must continue to have atomic case-insensitive duplicate protection");
assert.ok(schema.includes("where voided_at is null"),"Ignore voided invoices only");
assert.ok(form.includes('const duplicateKey=vatDuplicateKey(form)'));
assert.ok(form.includes('useEffect(()=>{\n  setDuplicateReviewed(false)'),
 "Changing supplier, number or document type resets user acknowledgement");
assert.ok(form.includes("setTimeout(()=>"),"Debounce typing on phones");
assert.ok(form.includes("controller.abort()"),"Cancel outdated duplicate checks");
assert.ok(form.includes('const latestDuplicate=await checkDuplicate(form)'),
 "Recheck the live database immediately before the final confirmation");
assert.ok(form.includes('latestDuplicate.status==="duplicate"'),"Stop confirmed duplicates from being posted");
assert.ok(form.includes('duplicateCheck.status==="possible"&&!duplicateReviewed'),
 "Do not permit an ambiguous number without explicit owner review");
assert.ok(form.includes('disabled={busy||scanBusy||duplicateBlocking||'),
 "Keep the save action locked while checking, if duplicate, or if database is unavailable");
assert.ok(form.includes('Registrert fra før')||form.includes('Allerede registrert'));
assert.ok(form.includes('Kontrollerer bilagsnummeret mot tidligere terminer'));
assert.ok(css.includes(".duplicateWarning")&&css.includes(".duplicateClear"));
assert.ok(route.includes('insert({...entry,confirmed_by:user.id})'),
 "Existing server-side and database collision protection stays in place");
assert.ok(route.includes('inserted.error.code==="23505"'),
 "Concurrent exact duplicates are still rejected atomically");
console.log("Bilagsnummer-dublettkontroll bestått: alle terminer, aktiv/opphevet, samme leverandør, annet firmanavn, kreditering, serverfeil og blokkert lagring.");
