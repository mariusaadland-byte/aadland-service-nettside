import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const helperSource=read("lib/tripletexDirectInvoicePilot.js")
 .replace(/^import .*?;\s*$/gm,"").replace(/^export /gm,"");
const positiveId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0?Number(x):null;
const nokToOre=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0?
 (Math.abs(Math.round(x*100)/100-x)<.000001?Math.round(x*100):null):null;
const nextInvoiceDate=day=>new Date(Date.parse(day+"T00:00:00Z")+86400000).toISOString().slice(0,10);
const invoiceGrossOre=()=>12500;
const previewTripletexInvoice=({invoice},unused,vat,customerId)=>{
 if(!vat.length)return {ready:false,reason:"MVA-kode mangler"};
 return {ready:true,body:{invoiceDate:invoice.issued_date,invoiceDueDate:invoice.due_date,
  orders:[{customer:{id:customerId},isPrioritizeAmountsIncludingVat:false,
   orderLines:[{description:"Ytelse",count:1,unitPriceExcludingVatCurrency:100,vatType:{id:3}}]}]}};
};
const helpers=new Function("crypto","invoiceGrossOre","previewTripletexInvoice",
 "positiveId","nokToOre","nextInvoiceDate",helperSource+
 ";return {directInvoiceDigest,directInvoicePilotPreview,directPaidPaymentPlan,directInvoiceSearchPath,duplicateDirectInvoiceSearch,directInvoiceVerification};")(
 crypto,invoiceGrossOre,previewTripletexInvoice,positiveId,nokToOre,nextInvoiceDate
);
const source={
 id:"11111111-1111-4111-8111-111111111111",status:"sent",
 invoice_number:"AS-WEB-2026-000001",issued_date:"2026-11-19",
 due_date:"2026-12-03",sent_at:"2026-11-19T09:00:00Z",
 paid_ore:0,credited_ore:0,pdf_base64:"fake-pdf",
 customer:{name:"Demo",contactId:"22222222-2222-4222-8222-222222222222"},
 line_items:[{description:"Ytelse",quantity:1,unitPriceOre:10000,vatRate:25}]
};

const paidInvoice={...source,paid_ore:3000};
const recorded=[
 {id:"p-one",amount_ore:1000,paid_on:"2026-11-18",
  recorded_at:"2026-11-18T10:00:00Z",reversed_at:null,vipps_reference:"V-100"},
 {id:"p-two",amount_ore:2000,paid_on:"2026-11-19",
  recorded_at:"2026-11-19T11:00:00Z",reversed_at:null,vipps_reference:null}
];
const paidVipps=[{id:"v-paid",state:"paid",captured_ore:1000,refunded_ore:0},
 {id:"v-cancelled",state:"cancelled",captured_ore:0,refunded_ore:0}];
const paidPlan=helpers.directPaidPaymentPlan(paidInvoice,recorded,paidVipps);
assert.equal(paidPlan.ready,true);
assert.equal(paidPlan.mode,"paid");
assert.equal(paidPlan.paidOre,3000);
assert.equal(paidPlan.paymentCount,2);
assert.equal(helpers.directPaidPaymentPlan(paidInvoice,
 recorded.slice().reverse(),paidVipps.slice().reverse()).paymentDigest,
 paidPlan.paymentDigest,"Payment history hash must not depend on database row order");
assert.ok(Date.parse(paidPlan.checkpointAt)<Date.parse(recorded[0].recorded_at));
const directPaid=helpers.directInvoicePilotPreview(paidInvoice,19,[{id:3}],paidPlan);
assert.equal(directPaid.ready,true);
assert.equal(directPaid.body.invoiceNumber,0);
assert.equal(directPaid.paymentCount,2);
assert.notEqual(directPaid.digest,helpers.directInvoiceDigest(paidInvoice,19));
assert.equal(helpers.directPaidPaymentPlan(paidInvoice,[recorded[0]],paidVipps).ready,false);
assert.equal(helpers.directPaidPaymentPlan(paidInvoice,
 [{...recorded[0],reversed_at:"2026-11-19T12:00:00Z"},recorded[1]],paidVipps).ready,false);
assert.equal(helpers.directPaidPaymentPlan(paidInvoice,recorded,
 [{...paidVipps[0],refunded_ore:1000}]).ready,false);
assert.equal(helpers.directPaidPaymentPlan(paidInvoice,recorded,
 [{...paidVipps[0],captured_ore:500}]).ready,false);
assert.equal(helpers.directPaidPaymentPlan(paidInvoice,[recorded[0],
 {...recorded[1],id:"p-one"}],paidVipps).ready,false);
assert.equal(helpers.directPaidPaymentPlan(paidInvoice,recorded.map((x,i)=>
 i===1?{...x,paid_on:"2026-02-30"}:x),paidVipps).ready,false);
assert.equal(helpers.directPaidPaymentPlan({...paidInvoice,paid_ore:0},recorded,paidVipps).ready,false);

const check=helpers.directInvoicePilotPreview(source,19,[{id:3}]);
assert.equal(check.ready,true);
assert.equal(check.grossOre,12500);
assert.equal(check.body.invoiceNumber,0,"Tripletex has its own accounting invoice number");
assert.ok(check.body.comment.includes(source.invoice_number));
assert.equal(helpers.directInvoicePilotPreview({...source,paid_ore:100},19,[{id:3}]).ready,false);
assert.equal(helpers.directInvoicePilotPreview({...source,credited_ore:50},19,[{id:3}]).ready,false);
assert.equal(helpers.directInvoicePilotPreview({...source,pdf_base64:""},19,[{id:3}]).ready,false);
assert.notEqual(check.digest,helpers.directInvoiceDigest({...source,paid_ore:100},19));
assert.notEqual(check.digest,helpers.directInvoiceDigest({...source,line_items:[{...source.line_items[0],quantity:2}]},19));
assert.ok(helpers.directInvoiceSearchPath(source.issued_date,19).includes("customerId=19"));
assert.ok(helpers.directInvoiceSearchPath(source.issued_date,19).includes("fields=id,invoiceNumber"));
const match={id:123,invoiceNumber:50007,invoiceDate:source.issued_date,
 amount:125,amountOutstanding:125,customer:{id:19},currency:{code:"NOK"}};
assert.equal(helpers.duplicateDirectInvoiceSearch([match],19,source.issued_date,12500).safe,false);
assert.equal(helpers.duplicateDirectInvoiceSearch([{...match,amount:99}],19,source.issued_date,12500).safe,true);
assert.equal(helpers.duplicateDirectInvoiceSearch([{id:1,amount:null}],19,source.issued_date,12500).safe,false);
assert.equal(helpers.duplicateDirectInvoiceSearch(Array.from({length:1000},(_,i)=>({
 ...match,id:i+1,amount:1})),19,source.issued_date,12500).safe,false);
assert.equal(helpers.directInvoiceVerification(match,19,source.issued_date,12500).ok,true);
assert.equal(helpers.directInvoiceVerification({...match,amountOutstanding:0},19,source.issued_date,12500).ok,false);
assert.equal(helpers.directInvoiceVerification({...match,customer:{id:20}},19,source.issued_date,12500).ok,false);
const apiSource=read("lib/tripletexApi.js")
 .replace(/^import "server-only";\s*/,"").replace(/^export /gm,"");
const {tripletexCreateUnsentedInvoice}=new Function(apiSource+
 ";return {tripletexCreateUnsentedInvoice};")();
const calls=[];
const mockFetch=async(url,options)=>{
 calls.push({url,options});
 return {ok:true,status:201,json:async()=>({value:{id:123}})};
};
const outcome=await tripletexCreateUnsentedInvoice(check.body,"mock-session","test",{fetcher:mockFetch});
assert.equal(outcome.value.id,123);
assert.equal(calls.length,1);
assert.equal(calls[0].options.method,"POST");
assert.ok(calls[0].url.endsWith("/invoice?sendToCustomer=false"),
 "Never re-send invoices already sent by Aadland Service");
assert.equal(JSON.parse(calls[0].options.body).invoiceNumber,0);
await assert.rejects(()=>tripletexCreateUnsentedInvoice({...check.body,paidAmount:100},
 "mock-session","test",{fetcher:mockFetch}));
assert.equal(calls.length,1,"Prepayment is never allowed in unpaid pilot");
const route=read("app/api/admin/tripletex/invoices/direct/route.js");
assert.ok(route.includes('user?.role!=="owner"')&&route.includes("sameOriginGuard(req)"));
assert.ok(route.includes('process.env.VERCEL_ENV!=="production"'));
assert.ok(route.indexOf('.insert({')<route.indexOf('const remote=await tripletexCreateUnsentedInvoice('));
assert.ok(route.includes('status:"needs_review"')&&route.includes('error_code:"outcome_unknown"'));
assert.ok(route.includes("duplicateDirectInvoiceSearch(latest?.values"));
assert.ok(route.includes("directInvoiceDigest(again.data,customerId,planAgain.paymentDigest)"));
assert.ok(route.includes('tripletex_invoice_api_links'));
assert.ok(route.includes("directPaidPaymentPlan(again.data,paymentAgain.data"));
assert.ok(route.includes("initial_import_checkpoint_at:preview.checkpointAt"));
assert.ok(route.includes("initial_paid_ore:preview.paidOre"));
assert.ok(route.includes("initial_payment_digest:preview.paymentDigest"));
const ui=read("app/admin/faktura/mva/tripletex/TripletexApiConnectClient.js");
assert.ok(ui.includes('onClick={()=>checkDirectPilot("transfer")}'));
assert.ok(ui.includes('if(!window.confirm('));
const sale=read("app/admin/faktura/mva/tripletex/TripletexSalesClient.js");
assert.ok(sale.includes("directClaims.some(x=>x.invoiceId===row.id)"));
const csv=read("app/api/admin/invoices/tripletex/sales/transfer/route.js");
assert.ok(csv.includes('s.from("tripletex_direct_invoice_claims")'));
assert.ok(csv.includes("CSV-import er sperret for å unngå dobbeltføring"));
const sql=read("supabase/migrations/20261119060000_tripletex_direct_invoice_claims.sql");
assert.ok(sql.includes("enable row level security")&&sql.includes("revoke all"));
console.log("Tripletex direktepilot bestått: ubetalt og betalt faktura, historiske Vipps/bank-innbetalinger, riktig dato, duplikatsperre, import-checkpoint, ingen ny kundesending og mock API.");
