import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// No database records, provider payments, or emails: pure helper/UI tests.
const source=readFileSync("lib/invoicePartialPayments.js","utf8").replace(/^export /gm,"");
const {parseInvoicePaymentAmountOre,invoicePaymentSuggestionOre,
 invoicePaymentAmountInput,invoicePaymentProgress}=
 new Function(source+";return {parseInvoicePaymentAmountOre,invoicePaymentSuggestionOre,invoicePaymentAmountInput,invoicePaymentProgress};")();
assert.equal(parseInvoicePaymentAmountOre("1250,50",125050),125050);
assert.equal(parseInvoicePaymentAmountOre("1250.50",125050),125050);
assert.equal(parseInvoicePaymentAmountOre(" 1250,5 ",125050),125050);
assert.equal(parseInvoicePaymentAmountOre("100",10000),10000);
assert.equal(parseInvoicePaymentAmountOre("0,01",1),1);
assert.equal(parseInvoicePaymentAmountOre("0001,05",105),105);
for(const bad of ["","0","0,00","-1","1e3","1,001","1 250,50","1.2.3","12,","NaN",null,undefined]){
 assert.throws(()=>parseInvoicePaymentAmountOre(bad,200000),
 undefined,"Invalid input accepted: "+String(bad));
}
assert.throws(()=>parseInvoicePaymentAmountOre("1250,51",125050),/overstige/);
assert.throws(()=>parseInvoicePaymentAmountOre("0,01",0),/utestående/);
assert.throws(()=>parseInvoicePaymentAmountOre("900000000000000",Number.MAX_SAFE_INTEGER));
assert.equal(invoicePaymentSuggestionOre(125050,25),31263);
assert.equal(invoicePaymentSuggestionOre(125050,50),62525);
assert.equal(invoicePaymentSuggestionOre(125050,100),125050);
assert.equal(invoicePaymentSuggestionOre(1,25),1);
assert.equal(invoicePaymentSuggestionOre(0,100),0);
assert.equal(invoicePaymentSuggestionOre(10000,90),0);
assert.equal(invoicePaymentAmountInput(31263),"312,63");
assert.equal(invoicePaymentAmountInput(100),"1,00");
assert.equal(parseInvoicePaymentAmountOre(invoicePaymentAmountInput(invoicePaymentSuggestionOre(125050,25)),125050),31263);
assert.deepEqual(invoicePaymentProgress({gross:125000,credited:0,paid:50000}),
 {amount:125000,paid:50000,outstanding:75000,paidPercent:40});
assert.deepEqual(invoicePaymentProgress({gross:125000,credited:25000,paid:75000}),
 {amount:100000,paid:75000,outstanding:25000,paidPercent:75});
assert.deepEqual(invoicePaymentProgress({gross:125000,credited:0,paid:125000}),
 {amount:125000,paid:125000,outstanding:0,paidPercent:100});
assert.deepEqual(invoicePaymentProgress({gross:125000,credited:125000,paid:0}),
 {amount:0,paid:0,outstanding:0,paidPercent:100});
assert.equal(invoicePaymentProgress({gross:100000,credited:0,paid:99999}).paidPercent,99,
 "One øre outstanding must never show 100% complete");
const client=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
const settlement=readFileSync("app/admin/faktura/InvoiceSettlementPanel.js","utf8");
assert.ok(client.includes('parseInvoicePaymentAmountOre(paymentAmount,paymentInfo.outstanding)'));
assert.ok(client.includes("invoicePaymentSuggestionOre(paymentInfo.outstanding,percent)"));
assert.ok(client.includes("setPaymentAmount(\"\")"),"Do not preload the full balance as a received payment");
assert.ok(client.includes("window.confirm(confirmation)"),"Ask whether bank/cash payment is actually received");
assert.ok(client.includes("Ikke registrer Vipps-betalinger manuelt"));
assert.ok(client.includes("manualPaymentBlocked"),"Never offer manual payment during active Vipps or mismatch");
assert.ok(client.includes("paymentDraft.outstandingAfterOre"),"Show remaining debt before owner confirms a partial payment");
assert.ok(client.includes("Fakturaen blir fullt oppgjort."),"Do not display Gjenstående: 0,00 kr for full payment");
assert.ok(client.includes("paymentDraft.amountOre===null"),"Invalid amounts must disable the submit button");
assert.ok(client.includes('inputMode="decimal"'));
assert.ok(client.includes("Angret/korrigert – teller ikke med"));
assert.ok(client.includes("Manuelt registrert betaling"));
assert.ok(client.includes("p.vipps_reference?\"Vipps-betaling\""));
assert.ok(client.includes("amountOre,paidOn:paymentDate,note:paymentNote"));
assert.ok(!client.includes('Math.round(Number(String(paymentAmount)'),"Manual payment amount must never rely on loose Number conversion");
assert.ok(settlement.includes('role="progressbar"'));
assert.ok(settlement.includes("progress.paidPercent"));
assert.ok(settlement.includes("progress.outstanding>0"));
assert.ok(!client.includes("Merk hele restbeløpet som betalt"),"Do not implicitly mark a transfer as received");
const route=readFileSync("app/api/admin/invoices/payments/route.js","utf8");
assert.ok(route.includes('s.rpc("record_invoice_payment"'));
assert.ok(route.includes("p_request_id:b.requestId"));
assert.ok(route.includes("amount>0")===false,"No server price math belongs in UI tests");
console.log("Delbetalinger bestått: trygg eksakt øre, 25/50/100 %, kreditnota, prosent, Vipps-sperre og bekreftet manuell registrering.");
