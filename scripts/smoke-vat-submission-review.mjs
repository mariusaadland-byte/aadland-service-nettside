import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const control=read("lib/vatReportingControl.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {vatPeriodKey}=new Function("vatDocumentPeriod",control+";return {vatPeriodKey};")(()=>null);
const source=read("lib/vatSubmissionReview.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {buildVatSubmissionReview}=new Function("vatPeriodKey",source+
 ";return {buildVatSubmissionReview};")(vatPeriodKey);
const period={year:2026,term:3,from:"2026-05-01",to:"2026-06-30",title:"3. termin 2026"};
const profile={registration_date:"2026-06-04",first_term_year:2026,first_term:3};
const purchase=[
 {id:"p1",document_date:"2026-05-10",confirmed_at:"2026-07-15T10:00:00Z"},
 {id:"p2",document_date:"2026-06-07",confirmed_at:"2026-08-22T12:00:00Z"}
];
const external=[{id:"e1",document_date:"2026-06-11",confirmed_at:"2026-08-22T11:00:00Z"}];
const current={
 period,profile,filing:{status:"filed",filed_on:"2026-08-01"},purchases:purchase,
 externalSales:external,purchaseFileIds:["p1"],externalFileIds:[]
};
let r=buildVatSubmissionReview(current);
assert.equal(r.readyForSubmission,false);
assert.equal(r.verifiedWithSkatteetaten,false);
assert.equal(r.documentCounts.preRegistrationPurchases,1);
assert.equal(r.documentCounts.purchaseAttachments,1);
assert.equal(r.documentCounts.externalAttachments,0);
assert.ok(r.checks.some(c=>c.code==="post_filing_entries"&&c.count===2));
assert.ok(r.checks.some(c=>c.code==="external_original_missing"));
assert.ok(r.checks.some(c=>c.code==="pre_registration_purchases"));
assert.ok(r.checks.some(c=>c.code==="bookkeeping_reconciliation"));
assert.ok(!r.checks.some(c=>c.code==="missing_return"));
r=buildVatSubmissionReview({...current,profile:null,filing:null});
assert.ok(r.checks.some(c=>c.code==="registration_unknown"));
assert.ok(r.checks.some(c=>c.code==="filing_unknown"));
r=buildVatSubmissionReview({...current,period:{year:2026,term:2,from:"2026-03-01",to:"2026-04-30"},
 purchases:[],externalSales:[],filing:{status:"not_filed"}});
assert.equal(r.beforeRegistration,true);
assert.ok(r.checks.some(c=>c.code==="before_registration"));
assert.ok(r.checks.some(c=>c.code==="missing_return"));
assert.ok(r.checks.some(c=>c.code==="no_imports"));
assert.throws(()=>buildVatSubmissionReview({...current,purchases:[{...purchase[0],document_date:"2026-07-01"}]}),/termin/);
assert.throws(()=>buildVatSubmissionReview({...current,externalFileIds:null}),/grunnlag/);
// Route smoke: no privileged writes and no leaked details to unauthenticated callers.
const store={
 vat_reporting_profile:[{id:"primary",...profile}],
 vat_reporting_term_status:[{year:2026,term:3,status:"filed",filed_on:"2026-08-01"}],
 vat_purchase_documents:purchase,
 vat_external_sales_documents:external,
 vat_purchase_document_files:[{purchase_document_id:"p1"}],
 vat_external_sales_files:[]
};
let owner="owner",failing="",readCount=0,writeCount=0;
const db=()=>({from(name){
 let clauses=[],allowed=null;
 const q={
  select(fields){assert.ok(!fields.includes("sha256")&&!fields.includes("storage_path"));
   return q;},
  eq(key,value){clauses.push(o=>o[key]===value);return q;},
  gte(key,value){clauses.push(o=>o[key]>=value);return q;},
  lte(key,value){clauses.push(o=>o[key]<=value);return q;},
  is(key,value){clauses.push(o=>o[key]===value||value===null&&o[key]===undefined);return q;},
  order(){return q;},
  in(key,values){allowed={key,values};return q;},
  update(){writeCount++;throw Error("Read-only route may not write.");},
  async maybeSingle(){
   readCount++;
   if(name===failing)return {error:{message:"db unavailable"},data:null};
   const rows=(store[name]||[]).filter(o=>clauses.every(f=>f(o)));
   return {error:null,data:rows[0]||null};
  },
  async range(start,end){
   readCount++;
   if(name===failing)return {error:{message:"db unavailable"},data:null};
   const rows=(store[name]||[]).filter(o=>clauses.every(f=>f(o))&&
    (!allowed||allowed.values.includes(o[allowed.key])));
   return {error:null,data:rows.slice(start,end+1)};
  }
 };
 return q;
}});
class NextResponse{
 static json(body,{status=200,headers={}}={}){return {status,body,headers};}
}
const boundsCode=read("lib/invoiceVatTermReport.js").replace(/^export /gm,"");
const {vatTermBounds}=new Function(boundsCode+";return {vatTermBounds};")();
const route=read("app/api/admin/invoices/vat-submission-review/route.js")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const GET=new Function("NextResponse","getAdminUser","db","vatTermBounds","buildVatSubmissionReview",
 route+";return GET;")(NextResponse,async()=>({role:owner}),db,vatTermBounds,buildVatSubmissionReview);
const call=term=>GET({url:"https://localhost/api/admin/invoices/vat-submission-review?year=2026&term="+term});
r=await call(3);
assert.equal(r.status,200);
assert.ok(r.body.review.checks.some(c=>c.code==="post_filing_entries"));
assert.equal(r.body.review.documentCounts.externalAttachments,0);
assert.equal(r.headers["Cache-Control"],"private, no-store");
owner="staff";r=await call(3);assert.equal(r.status,403);
owner="owner";r=await call(7);assert.equal(r.status,400);
failing="vat_external_sales_files";r=await call(3);assert.equal(r.status,503,"Attachment query failure must not say all files are present");
failing="";assert.equal(writeCount,0);assert.ok(readCount>0);
const screen=read("app/admin/faktura/mva/VatSubmissionReviewClient.js");
const page=read("app/admin/faktura/mva/InvoiceVatTermClient.js");
assert.ok(page.includes("VatSubmissionReviewClient")&&page.includes("revision={reload}"));
assert.ok(screen.includes("klar")||screen.includes("klarsignal"));
assert.ok(screen.includes("Skatteetaten"));
console.log("MVA-kontrolliste bestått: retrospektive bilag, etterinnsending, filkontroll, manglende status og fail-closed API.");
