import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=x=>readFileSync(x,"utf8");
const helperSource=read("lib/tripletexReceiptReconciliation.js").replace(/^export /gm,"");
const {positiveTripletexVoucherId,remoteTripletexVoucherSummary,purchaseReceiptGrossOre}=
 new Function(helperSource+";return {positiveTripletexVoucherId,remoteTripletexVoucherSummary,purchaseReceiptGrossOre};")();

for(const x of ["","0","-1","1.2","1e4","NaN",String(Number.MAX_SAFE_INTEGER+1)])
 assert.equal(positiveTripletexVoucherId(x),null);
assert.equal(positiveTripletexVoucherId("12345"),12345);
const remote={value:{id:12345,year:2026,number:518,date:"2026-11-19",isTemporary:false,
 postings:[{vatType:{number:"1"},account:{number:6550}}]}};
const summary=remoteTripletexVoucherSummary(remote,12345);
assert.equal(summary.voucherId,12345);
assert.equal(summary.canReview,true);
assert.equal(summary.reviewRequired,true);
assert.equal(summary.postingCount,1);
assert.deepEqual(summary.vatCodes,["1"]);
assert.deepEqual(summary.accounts,["6550"]);
assert.equal(remoteTripletexVoucherSummary({value:{...remote.value,isTemporary:true}},12345).canReview,false);
assert.equal(remoteTripletexVoucherSummary({value:{...remote.value,isTemporary:undefined}},12345).canReview,false);
assert.throws(()=>remoteTripletexVoucherSummary(remote,22222));
assert.equal(purchaseReceiptGrossOre({base_ore:8000,vat_ore:2000}),10000);
assert.throws(()=>purchaseReceiptGrossOre({base_ore:"wrong",vat_ore:2000}));

const routeSource=read("app/api/admin/invoices/tripletex/reconcile/route.js");
const raw=routeSource.replace(/^import[\s\S]*?;\n/gm,"")
 .replace(/^export const [^\n]+\n/gm,"")
 .replace(/export async function (GET|POST)\(/g,"async function $1(");
const sourceDoc={
 id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
 supplier_name:"Testbutikk AS",supplier_document_number:"FAK-2026-001",
 document_date:"2026-11-17",kind:"purchase",
 base_ore:8000,vat_ore:2000,deductible_vat_ore:2000,deduction_percent:100,
 voided_at:null
};
const sourceFile={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
 original_filename:"faktura.pdf",file_size:238,sha256:"a".repeat(64)};
const transfer={status:"accepted",recipient:"test@ebilag.com",provider_message_id:"resend-mock"};
const connection={environment:"production",ciphertext:"MOCK"};
let user={id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",role:"owner"},
 production=true,providerCalls=0,saved=[],insertError=false,failApi=false;
let doc={...sourceDoc},attachment={...sourceFile},existingTransfer={...transfer};
function query(table,operation="select",payload=null){
 const q={
  select(){return q},eq(){return q},is(){return q},order(){return q},
  range(){return Promise.resolve({data:table==="vat_tripletex_receipt_reconciliations"?saved:[],error:null})},
  insert(data){return query(table,"insert",data)},
  async maybeSingle(){
   if(table==="vat_purchase_documents")return {data:doc,error:null};
   if(table==="vat_purchase_document_files")return {data:attachment,error:null};
   if(table==="vat_tripletex_receipt_transfers")return {data:existingTransfer,error:null};
   if(table==="vat_tripletex_receipt_reconciliations")return {data:saved.find(x=>x.purchase_document_id===doc?.id)||null,error:null};
   throw Error("unrecognized mock table "+table);
  },
  async single(){
   if(operation!=="insert"||table!=="vat_tripletex_receipt_reconciliations")throw Error("write not permitted");
   if(insertError||saved.some(x=>x.purchase_document_id===payload.purchase_document_id ||
    x.environment===payload.environment && x.tripletex_voucher_id===payload.tripletex_voucher_id))
    return {data:null,error:{code:"23505"}};
   saved.push({...payload,verified_at:"2026-11-21T01:00:00Z"});
   return {data:{...payload,verified_at:"2026-11-21T01:00:00Z"},error:null};
  }
 };return q;
}
const db=()=>({from:table=>query(table)});
const nextResponse={json(body,opts={}){return {body,status:opts.status||200}}};
const auth=async()=>user;
const gate=()=>null;
const who=async()=>connection;
const session=async()=> "fake-session";
const provider=async(path)=>{
 providerCalls++;
 assert.ok(path.startsWith("/ledger/voucher/"));
 assert.ok(path.includes("fields="));
 if(failApi)throw Object.assign(new Error("provider denied"),{name:"TripletexApiError",status:403});
 return remote;
};
const env={env:{get VERCEL_ENV(){return production?"production":"preview"}}};
const api=new Function("NextResponse","getAdminUser","sameOriginGuard","db",
 "storedTripletexConnection","unprotectTripletexToken","tripletexOpenSession","tripletexRead",
 "positiveTripletexVoucherId","remoteTripletexVoucherSummary","purchaseReceiptGrossOre","process",
 raw+"\nreturn {GET,POST};")(
 nextResponse,auth,gate,db,who,()=>"fake-token",session,provider,
 positiveTripletexVoucherId,remoteTripletexVoucherSummary,purchaseReceiptGrossOre,env
);
const post=body=>api.POST({json:async()=>({documentId:sourceDoc.id,voucherId:"12345",...body})});
let result=await api.GET();
assert.equal(result.status,200);assert.equal(result.body.verifiedCount,0);
result=await post({action:"check"});
assert.equal(result.status,200);
assert.equal(providerCalls,1);
assert.equal(result.body.remote.number,518);
assert.equal(result.body.document.grossOre,10000);
assert.equal(saved.length,0,"Read-only check may never mark a voucher booked");
const confirmation={
 action:"confirm",expectedVoucherNumber:518,expectedVoucherYear:2026,
 expectedSupplierDocumentNumber:sourceDoc.supplier_document_number,
 originalSha256:sourceFile.sha256,
 vatCode:"1",accountCode:"6550",
 note:"Kontrollert mot originalkvittering og faktisk bokført Tripletex-bilag.",
 confirmed:{supplier:true,total:true,vatAndDeduction:true,original:true,noDuplicate:true,bookedInTripletex:true}
};
result=await post({...confirmation,confirmed:{...confirmation.confirmed,noDuplicate:false}});
assert.equal(result.status,400);assert.equal(saved.length,0);
result=await post({...confirmation,originalSha256:"bad"});
assert.equal(result.status,409);assert.equal(saved.length,0);
result=await post({...confirmation,expectedVoucherNumber:517});
assert.equal(result.status,409);assert.equal(saved.length,0);
result=await post({...confirmation,vatCode:"",accountCode:"6550"});
assert.equal(result.status,400);assert.equal(saved.length,0);
result=await post(confirmation);
assert.equal(result.status,200);assert.equal(result.body.status,"owner_verified_booked");
assert.equal(saved.length,1);
assert.equal(saved[0].confirmed_vat_and_deduction,true);
result=await api.GET();assert.equal(result.body.verifiedCount,1);
result=await post(confirmation);assert.equal(result.status,409,"No silent duplicate bookkeeping link");
assert.equal(saved.length,1);

saved=[];user={id:user.id,role:"staff"};
result=await api.GET();assert.equal(result.status,403);
result=await post(confirmation);assert.equal(result.status,403);
user={...user,role:"owner"};
production=false;
result=await post(confirmation);assert.equal(result.status,403);
production=true;
existingTransfer={status:"needs_review"};
result=await post(confirmation);assert.equal(result.status,409);
existingTransfer={...transfer};
failApi=true;
result=await post(confirmation);assert.equal(result.status,503);
assert.equal(saved.length,0,"No accounting confirmation if provider read fails");
failApi=false;
const before=providerCalls;
result=await post({...confirmation,voucherId:"not-a-number"});
assert.equal(result.status,400);
assert.equal(providerCalls,before);

const migration=read("supabase/migrations/20261121040000_vat_tripletex_receipt_reconciliations.sql");
for(const marker of [
 "purchase_document_id uuid primary key",
 "constraint unique_tripletex_receipt_voucher unique",
 "enable row level security",
 "revoke all on public.vat_tripletex_receipt_reconciliations from public,anon,authenticated",
 "grant select,insert on public.vat_tripletex_receipt_reconciliations to service_role",
 "confirmed_original boolean not null check (confirmed_original)",
 "remotely_not_temporary boolean not null check (remotely_not_temporary)"
])assert.ok(migration.includes(marker),"Missing database safeguard: "+marker);
assert.ok(!routeSource.includes("tripletexCreate")&&!routeSource.includes("sendToLedger")&&!routeSource.includes(".emails.send"));
const ui=read("app/admin/faktura/mva/tripletex/TripletexReceiptsClient.js");
const panel=read("app/admin/faktura/mva/tripletex/TripletexReceiptReconciliationPanel.js");
assert.ok(ui.includes("Bokføring ikke verifisert"));
assert.ok(ui.includes("Kontroller bokføring"));
assert.ok(ui.includes("verifiedLoaded?bookedCount"));
assert.ok(panel.includes("bookedInTripletex"));
assert.ok(panel.includes("Bekreft kontrollert bokføring"));
assert.ok(panel.includes('action:"check"')&&panel.includes('action:"confirm"'));
assert.ok(panel.includes("vatAndDeduction"));
assert.ok(panel.includes("noDuplicate"));
console.log("S-05 bestått: e-post akseptert ≠ bokført, API kun lesing, eierbekreftelse, original/MVA/duplikat og ingen reell regnskapsskriving.");
