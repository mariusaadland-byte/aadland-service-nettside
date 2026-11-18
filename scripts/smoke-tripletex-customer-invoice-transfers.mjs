import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const paymentJs=read("lib/invoicePaymentStatus.js").replace(/^export /gm,"");
const {invoiceGrossOre,invoicePaymentState}=new Function(paymentJs+
 ";return {invoiceGrossOre,invoicePaymentState};")();
const settlementJs=read("lib/invoiceSettlementInfo.js")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {summarizeInvoiceActivity,invoiceSettlementInfo}=new Function("invoicePaymentState",
 settlementJs+";return {summarizeInvoiceActivity,invoiceSettlementInfo};")(invoicePaymentState);
const exportJs=read("lib/tripletexSalesInvoiceExport.js")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {salesInvoiceExportOverview,tripletexSalesInvoiceCsv,auditInvoicePaymentEntries}=new Function(
 "invoiceGrossOre","invoicePaymentState","invoiceSettlementInfo",
 exportJs+";return {salesInvoiceExportOverview,tripletexSalesInvoiceCsv,auditInvoicePaymentEntries};")(
 invoiceGrossOre,invoicePaymentState,invoiceSettlementInfo
);
const queueJs=read("lib/tripletexCustomerInvoiceQueue.js").replace(/^export /gm,"");
const {tripletexCustomerInvoiceQueue,tripletexCustomerInvoiceSelections,validateTripletexImportNumber,tripletexPaymentTypeFor}=
 new Function(queueJs+
 ";return {tripletexCustomerInvoiceQueue,tripletexCustomerInvoiceSelections,validateTripletexImportNumber,tripletexPaymentTypeFor};")();
const id1="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id2="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ownerId="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const pdf=Buffer.concat([Buffer.from("%PDF-1.4\n"),Buffer.alloc(140,65),Buffer.from("\n%%EOF")]);
const invoices=[{
 id:id1,status:"sent",invoice_number:"AS-2026-1",
 customer:{name:"Testkunde 1",email:"one@example.invalid"},
 line_items:[{description:"Arbeid",quantity:1,unitPriceOre:10000,vatRate:25}],
 issued_date:"2026-10-12",issued_at:"2026-10-12T10:00:00Z",
 due_date:"2026-11-14",sent_at:"2026-10-12T11:00:00Z",
 paid_ore:0,credited_ore:0,pdf_base64:pdf.toString("base64")
},{
 id:id2,status:"sent",invoice_number:"AS-2026-2",
 customer:{name:"Testkunde 2",email:"two@example.invalid"},
 line_items:[{description:"Hjelp",quantity:2,unitPriceOre:10000,vatRate:25}],
 issued_date:"2026-10-13",issued_at:"2026-10-13T10:00:00Z",
 due_date:"2026-11-15",sent_at:"2026-10-13T11:00:00Z",
 paid_ore:25000,credited_ore:0,pdf_base64:pdf.toString("base64")
}];
const records={
 invoice_drafts:invoices,
 invoice_vipps_payments:[],
 invoice_credit_notes:[],
 invoice_payments:[{id:"payment",invoice_id:id2,amount_ore:25000,reversed_at:null,vipps_reference:null}],
 invoice_tripletex_transfers:[]
};
assert.equal(validateTripletexImportNumber("80000000"),80000000);
assert.equal(validateTripletexImportNumber("0"),null);
assert.equal(validateTripletexImportNumber("not a number"),null);
const initial=tripletexCustomerInvoiceQueue([
 {id:id1,state:"unpaid",paidOre:0},
 {id:id2,state:"paid",paidOre:25000},
 {id:"review",state:"review",paidOre:1000}
],[]);
assert.equal(initial.pending.length,2);
assert.equal(initial.needsReview.length,1);
assert.equal(initial.prepared.length,0);
assert.equal(initial.confirmed.length,0);
const selections=tripletexCustomerInvoiceSelections(initial);
assert.equal(selections.withPayment.length,1);
assert.equal(selections.withoutPayment.length,1);
assert.equal(selections.needsReview.length,1);
assert.equal(selections.withPayment[0].id,id2);
assert.equal(selections.withoutPayment[0].id,id1);
assert.throws(()=>tripletexPaymentTypeFor({state:"paid",paymentSource:"other"},"",""),
 /Oppgi riktig/);
assert.equal(tripletexPaymentTypeFor({state:"paid",paymentSource:"other"},"","BANK"),"BANK");

let role="owner",originOk=true,production=true,failDb=false;
function query(table,operation="select",payload=null){
 const equal=[],inVals=[];
 let from=0,to=Infinity;
 const q={
  select(){return q;},
  order(){return q;},
  range(a,b){from=a;to=b;return q;},
  eq(k,v){equal.push([k,v]);return q;},
  in(k,v){inVals.push([k,v]);return q;},
  insert(value){return query(table,"insert",value);},
  update(value){return query(table,"update",value);},
  then(resolve,reject){
   if(failDb)return Promise.resolve({data:null,error:{message:"Database offline"}}).then(resolve,reject);
   let entries=(records[table]||[]).filter(row=>
    equal.every(([k,v])=>row[k]===v)&&inVals.every(([k,v])=>v.includes(row[k])));
   if(operation==="insert"){
    const incoming=Array.isArray(payload)?payload:[payload];
    const existing=records[table]||[];
    if(incoming.some(r=>existing.some(e=>e.invoice_id===r.invoice_id||
     e.import_number===r.import_number)))
     return Promise.resolve({data:null,error:{code:"23505"}}).then(resolve,reject);
    const saved=incoming.map(r=>({id:crypto.randomUUID(),prepared_at:"2026-11-18T20:50:00Z",...r}));
    existing.push(...saved);
    return Promise.resolve({data:saved,error:null}).then(resolve,reject);
   }
   if(operation==="update"){
    for(const row of entries)Object.assign(row,payload);
    return Promise.resolve({data:entries,error:null}).then(resolve,reject);
   }
   return Promise.resolve({data:entries.slice(from,to+1),error:null}).then(resolve,reject);
  }
 };
 return q;
}
const db=()=>({from:table=>query(table)});
class MockResponse extends Response{
 static json(value,init={}){return Response.json(value,init)}
}
const route=read("app/api/admin/invoices/tripletex/sales/transfer/route.js");
assert.ok(route.includes("sameOriginGuard(req)"));
assert.ok(route.includes('user?.role!=="owner"'));
assert.ok(route.includes('process.env.VERCEL_ENV!=="production"'));
assert.ok(route.includes('status:"prepared"'));
assert.ok(route.includes('status:"confirmed"'));
assert.ok(!route.includes("Resend")&&!route.includes("tripletex.no/v2"),
 "Staging must not falsely claim to call Tripletex");
const compiled=route.replace(/^import .*;\n/gm,"")
 .replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const {GET,POST}=new Function(
 "NextResponse","crypto","getAdminUser","db","sameOriginGuard",
 "osloDateKey","summarizeInvoiceActivity","salesInvoiceExportOverview",
 "tripletexSalesInvoiceCsv","auditInvoicePaymentEntries","validateTripletexImportNumber",
 "tripletexPaymentTypeFor","process",compiled+";return {GET,POST};"
)(
 MockResponse,crypto,async()=>({role,id:ownerId}),db,
 ()=>originOk?null:Response.json({error:"Origin mismatch"},{status:403}),
 ()=>"2026-11-18",summarizeInvoiceActivity,salesInvoiceExportOverview,
 tripletexSalesInvoiceCsv,auditInvoicePaymentEntries,validateTripletexImportNumber,
 tripletexPaymentTypeFor,
 {env:{get VERCEL_ENV(){return production?"production":"preview"}}}
);
const get=(q="")=>new Request("https://example.invalid/api/admin/invoices/tripletex/sales/transfer"+q);
const post=body=>new Request("https://example.invalid/api/admin/invoices/tripletex/sales/transfer",{
 method:"POST",headers:{origin:"https://example.invalid","content-type":"application/json"},
 body:JSON.stringify(body)});
const prepareOne={action:"prepare",mode:"unpaid-single",invoiceId:id1,startNumber:80000000};
let response=await GET(get());
assert.equal(response.status,200);
assert.deepEqual((await response.json()).transfers,[]);
role="staff";response=await GET(get());assert.equal(response.status,403);
response=await POST(post(prepareOne));assert.equal(response.status,403);
role="owner";originOk=false;response=await POST(post(prepareOne));assert.equal(response.status,403);
originOk=true;production=false;response=await POST(post(prepareOne));assert.equal(response.status,403);
production=true;
response=await POST(post({...prepareOne,startNumber:1}));assert.equal(response.status,400);
response=await POST(post({...prepareOne,invoiceId:"bad"}));assert.equal(response.status,400);
assert.equal(records.invoice_tripletex_transfers.length,0);

response=await POST(post({action:"prepare",invoiceId:id1,startNumber:80000000}));
assert.equal(response.status,400,"Explicit paid-batch or unpaid-single mode is mandatory");
response=await POST(post({action:"prepare",mode:"paid-batch",invoiceIds:[id1],startNumber:80000000}));
assert.equal(response.status,409,"Cannot include unpaid invoice in paid batch");
response=await POST(post({action:"prepare",mode:"unpaid-single",invoiceIds:[id1,id2],startNumber:80000000}));
assert.equal(response.status,400,"Unpaid invoices cannot be batched");
response=await POST(post(prepareOne));
assert.equal(response.status,200);
let prepared=await response.json();
assert.equal(prepared.status,"prepared");
assert.ok(prepared.downloadUrl.includes("format=csv&batchId="));
assert.equal(records.invoice_tripletex_transfers.length,1);
assert.equal(records.invoice_tripletex_transfers[0].import_number,80000000);
const annotated=tripletexCustomerInvoiceQueue([
 {id:id1,state:"unpaid"},{id:id2,state:"paid"}],records.invoice_tripletex_transfers);
assert.equal(annotated.pending.length,1);
assert.equal(annotated.prepared.length,1);
assert.equal(annotated.confirmed.length,0,
 "Downloading/exporting must NEVER falsely mark an invoice imported");
response=await GET(get("?format=csv&batchId="+prepared.batchId));
assert.equal(response.status,200);
let exported=await response.text();
assert.ok(exported.includes('"80000000"')&&exported.includes("AS-2026-1"));
assert.ok(!exported.includes("AS-2026-2"));
response=await POST(post(prepareOne));assert.equal(response.status,409);
response=await POST(post({action:"prepare",mode:"paid-batch",invoiceId:id2,startNumber:80000000,paymentTypeOther:"BANK"}));
assert.equal(response.status,409,"Never reuse an import number");
response=await POST(post({action:"prepare",mode:"paid-batch",invoiceId:id2,startNumber:80000001}));
assert.equal(response.status,400,"Paid invoice requires payment type");
response=await POST(post({action:"prepare",mode:"paid-batch",invoiceId:id2,startNumber:80000001,paymentTypeOther:"BANK"}));
assert.equal(response.status,200);
const prepared2=await response.json();
response=await GET(get("?format=csv&batchId="+prepared2.batchId));
assert.equal(response.status,200);
exported=await response.text();
assert.ok(exported.includes('"80000001"'));
assert.ok(exported.includes('"BANK"'));
assert.ok(exported.includes('"250,00"'));
assert.ok(!exported.includes("AS-2026-1"));
assert.equal(records.invoice_tripletex_transfers.length,2);
response=await POST(post({action:"confirm",invoiceId:id1,confirmed:false,importNumbers:[80000000]}));
assert.equal(response.status,400);
response=await POST(post({action:"confirm",invoiceId:id1,confirmed:true,importNumbers:[99999999]}));
assert.equal(response.status,409);
response=await POST(post({action:"confirm",invoiceId:id1,confirmed:true,importNumbers:[80000000]}));
assert.equal(response.status,200);
assert.equal((await response.json()).count,1);
const after=tripletexCustomerInvoiceQueue([
 {id:id1,state:"unpaid"},{id:id2,state:"paid"}],records.invoice_tripletex_transfers);
assert.equal(after.confirmed.length,1,"Only owner's verified import moves to history");
assert.equal(after.prepared.length,1,"Other prepared invoices remain in work list");
assert.equal(after.pending.length,0);
response=await POST(post({action:"confirm",invoiceId:id1,confirmed:true,importNumbers:[80000000]}));
assert.equal(response.status,409,"No double confirmation");
response=await GET(get());
assert.equal(response.status,200);
assert.equal((await response.json()).transfers.length,2);
invoices[1].paid_ore=10000;
response=await GET(get("?format=csv&batchId="+prepared2.batchId));
assert.equal(response.status,409,"Changed payment amount must block stale invoice export");
invoices[1].paid_ore=25000;
records.invoice_tripletex_transfers.length=0;
response=await POST(post({
 action:"prepare",mode:"paid-batch",invoiceIds:[id1,id2],startNumber:80000100,paymentTypeOther:"BANK"
}));
assert.equal(response.status,409,"Bulk paid action must reject even one unpaid invoice");
const id3="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
invoices.push({...invoices[1],id:id3,invoice_number:"AS-2026-3",
 line_items:[{description:"Ekstra arbeid",quantity:1,unitPriceOre:10000,vatRate:25}],
 paid_ore:12500,issued_date:"2026-10-14",due_date:"2026-11-16",
 issued_at:"2026-10-14T10:00:00Z",sent_at:"2026-10-14T11:00:00Z"});
records.invoice_payments.push({id:"payment3",invoice_id:id3,amount_ore:12500,
 reversed_at:null,vipps_reference:null});
response=await POST(post({
 action:"prepare",mode:"paid-batch",invoiceIds:[id2,id3],startNumber:80000100,paymentTypeOther:"BANK"
}));
assert.equal(response.status,200);
const batch=await response.json();
assert.equal(batch.invoiceIds.length,2);
response=await GET(get("?format=csv&batchId="+batch.batchId));
assert.equal(response.status,200);
exported=await response.text();
assert.ok(exported.includes("AS-2026-2")&&exported.includes("AS-2026-3"));
assert.ok(!exported.includes("AS-2026-1"),"Paid batch must leave unpaid invoices untouched");
response=await POST(post({action:"confirm",invoiceId:id2,confirmed:true,importNumbers:[80000100]}));
assert.equal(response.status,200);
response=await GET(get("?format=csv&batchId="+batch.batchId));
assert.equal(response.status,200);
exported=await response.text();
assert.ok(!exported.includes("AS-2026-2"),"Never re-export a confirmed invoice in partially completed batch");
assert.ok(exported.includes("AS-2026-3"));
response=await POST(post({action:"confirm",invoiceId:id3,confirmed:true,importNumbers:[80000101]}));
assert.equal(response.status,200);
response=await GET(get("?format=csv&batchId="+batch.batchId));
assert.equal(response.status,409,"Fully confirmed batch cannot be downloaded for accidental duplicate import");
failDb=true;response=await GET(get());assert.equal(response.status,503);

const ui=read("app/admin/faktura/mva/tripletex/TripletexSalesClient.js");
for(const phrase of ["Fakturaer med innbetaling","Fakturaer uten innbetaling",
 "Overfør fakturaer med innbetaling","Overfør denne fakturaen",
 "Bekreft importert","Overføringshistorikk","importNumbers:numbers",
 "tripletexCustomerInvoiceQueue","tripletexCustomerInvoiceSelections",
 "window.confirm(","downloadUrl","Fakturaoversikt"]){
 assert.ok(ui.includes(phrase),"Missing sales invoice transfer workflow "+phrase);
}
assert.ok(ui.includes("queue.prepared.filter(matches)"),"Prepared must remain in work list");
assert.ok(ui.includes("queue.confirmed"),"Confirmed only in history");
assert.ok(ui.includes('window.confirm('),"No silent accounting import action");
assert.ok(ui.includes("paymentTypeVipps")&&ui.includes("paymentTypeOther"));
assert.ok(ui.includes("Avansert – manuell CSV-import"),
 "Technical CSV fields must be behind an Advanced disclosure");
assert.ok(ui.includes('<details className={styles.importSettings} ref={csvSettingsRef}>'),
 "CSV settings must be collapsed initially regardless of paid invoice count");
assert.ok(!ui.includes("open={withPayment.length>0}"),
 "Never auto-expand the confusing CSV fields when paid invoices exist");
assert.ok(ui.includes("csvSettingsRef.current.open=true"),
 "Attempting paid export without payment type should open Advanced to show missing fields");
assert.ok(ui.includes("Overfør fakturaer med innbetaling (")&&
 ui.includes("Overfør denne fakturaen – CSV"),
 "Simple transfer controls must remain visible and clearly state CSV fallback");
const page=read("app/admin/faktura/mva/tripletex/page.js");
assert.ok(page.indexOf("<TripletexApiConnectClient/>")<
 page.indexOf("<TripletexSalesClient/>")&&
 page.indexOf("<TripletexSalesClient/>")<page.indexOf("<TripletexReceiptsClient/>"),
 "API setup must precede outgoing invoices and supplier receipts");
const styles=read("app/admin/faktura/mva/tripletex/TripletexReceipts.module.css");
assert.ok(styles.includes(".apiConnection{")&&styles.includes(".importSettings{"),
 "API primary step and manual CSV disclosure must be styled");
assert.ok(ui.includes('prepare(withPayment.map(x=>x.id),"paid-batch")'),
 "Only verified paid invoices may be collected by bulk button");
assert.ok(ui.includes('prepare([x.id],"unpaid-single")'),
 "Unpaid invoice transfer must be a per-invoice action");
assert.ok(!ui.includes("includePaid"),"No switch that silently imports unpaid invoices in a paid batch");
assert.ok(read("supabase/migrations/20261118214500_invoice_tripletex_transfer_log.sql")
 .includes("invoice_id uuid not null unique"),"Only one transfer per original invoice");
console.log("Tripletex kundefakturaer bestått: eier, CSRF, testgren-sperre, ledige importnumre, én faktura eller flere, Vipps/bank, låst klargjøring, kontrollerte CSV-filer, eksplisitt importbekreftelse, historikk og dataintegritet. Ingen faktiske importhandlinger utført.");
