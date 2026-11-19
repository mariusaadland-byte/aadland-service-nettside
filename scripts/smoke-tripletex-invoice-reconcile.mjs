import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const source=read("lib/tripletexInvoiceReconciliation.js").replace(/^export /gm,"");
const {positiveId,nokToOre,nextInvoiceDate,verifyTripletexInvoice,compareTripletexBalance}=
 new Function(source+";return {positiveId,nokToOre,nextInvoiceDate,verifyTripletexInvoice,compareTripletexBalance};")();
const transfer={import_number:80000001,original_issued_date:"2026-11-15",snapshot_gross_ore:125000};
const invoice={id:321,invoiceNumber:80000001,invoiceDate:"2026-11-15",customer:{id:44},
 amount:1250.00,amountOutstanding:1250.00,isCreditNote:false,isCredited:false,currency:{code:"NOK"}};
assert.equal(positiveId(0),null);
assert.equal(positiveId("1"),1);
assert.equal(nokToOre(12.34),1234);
assert.equal(nokToOre("12.34"),null);
assert.equal(nokToOre(12.345),null);
assert.equal(nextInvoiceDate("2026-11-15"),"2026-11-16");
assert.equal(nextInvoiceDate("2026-02-30"),null);
const ok=verifyTripletexInvoice(invoice,transfer,44);
assert.equal(ok.ok,true);
assert.equal(ok.id,321);
assert.equal(ok.outstandingOre,125000);
for(const [key,value] of [
 ["invoiceNumber",80000002],["invoiceDate","2026-11-16"],["amount",1250.01],
 ["amountOutstanding",1300],["isCredited",true],["isCreditNote",true],
 ["currency",{code:"EUR"}],["customer",{id:55}]]){
 assert.equal(verifyTripletexInvoice({...invoice,[key]:value},transfer,44).ok,false,
  "Invoice reconciliation must reject mismatch: "+key);
}
assert.equal(compareTripletexBalance({local_outstanding_ore:100000,
 remote_outstanding_ore:100000}).status,"match");
assert.equal(compareTripletexBalance({local_outstanding_ore:100000,
 remote_outstanding_ore:80000}).differenceOre,20000);
const api=read("app/api/admin/tripletex/invoices/reconcile/route.js");
assert.ok(api.includes('user?.role!=="owner"')&&api.includes("sameOriginGuard(req)"));
assert.ok(api.includes('process.env.VERCEL_ENV!=="production"'));
assert.ok(api.includes('transfer.status!=="confirmed"')&&api.includes('invoice.status!=="sent"'));
assert.ok(api.includes('tripletex_customer_links')&&api.includes('tripletexOpenSession('));
assert.ok(api.includes("verifyTripletexInvoice(received?.value,transfer,customerId)"));
assert.ok(api.includes("original_invoice_number")&&api.includes("snapshot_gross_ore"));
assert.ok(api.includes(".upsert(record,{onConflict:\"invoice_id\"})"));
assert.ok(!api.includes('tripletexCreateInvoice')&&!api.includes('tripletexRecordPayment'),
 "Reconciliation must not write any remote financial records");
const ui=read("app/admin/faktura/mva/tripletex/TripletexSalesClient.js");
assert.ok(ui.includes("Kontroller i Tripletex")&&ui.includes("Oppdater betalingskontroll"));
assert.ok(ui.includes('action:existing?"check":"link"'));
const sql=read("supabase/migrations/20261119033000_tripletex_invoice_api_links.sql");
assert.ok(sql.includes("unique(environment,tripletex_invoice_id)"));
assert.ok(sql.includes("enable row level security"));
assert.ok(sql.includes("grant select,insert,update"));
console.log("Tripletex fakturaavstemming bestått: identitet, NOK, dato, kunde-ID, beløp, rest, eier, read-only og duplikatsperre.");
