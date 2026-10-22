import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("lib/vippsInvoiceDemo.js","utf8").replace(/^export /gm,"");
const {createVippsDemo,advanceVippsDemo,canRunVippsDemo,vippsDemoTotals,DEMO_START_ORE,DEMO_MAX_ORE}=
 new Function(source+";return {createVippsDemo,advanceVippsDemo,canRunVippsDemo,vippsDemoTotals,DEMO_START_ORE,DEMO_MAX_ORE};")();

assert.equal(DEMO_START_ORE,125000);
for(const amount of [0,-1,10,99,DEMO_MAX_ORE+1,1.2345,NaN,Infinity])
 assert.throws(()=>createVippsDemo(amount),"Reject malformed or unsafe demo amounts");
const original=createVippsDemo();
assert.equal(original.state,"idle");assert.equal(vippsDemoTotals(original).outstandingOre,125000);
assert.equal(canRunVippsDemo(original,"refund-all"),false);
assert.deepEqual(advanceVippsDemo(original,"refund-all"),original,"Cannot refund an unpaid demo");
let p=advanceVippsDemo(original,"start");
assert.equal(p.state,"pending");
let canceled=advanceVippsDemo(p,"cancel");
assert.equal(canceled.state,"cancelled");
assert.equal(vippsDemoTotals(canceled).netOre,0);
assert.equal(canRunVippsDemo(canceled,"full"),false);
assert.equal(canRunVippsDemo(canceled,"receipt-sent"),false);
p=advanceVippsDemo(p,"partial");
assert.equal(p.state,"partial");assert.equal(p.capturedOre,50000);
assert.equal(p.receiptState,"pending");
assert.deepEqual(vippsDemoTotals(p),{
 amountOre:125000,capturedOre:50000,refundedOre:0,netOre:50000,outstandingOre:75000,fullyPaid:false
});
p=advanceVippsDemo(p,"receipt-error");
assert.equal(p.receiptState,"failed");
p=advanceVippsDemo(p,"receipt-sent");assert.equal(p.receiptState,"sent");
assert.equal(canRunVippsDemo(p,"receipt-sent"),false,"No duplicate receipt confirmation");
p=advanceVippsDemo(p,"refund-part");
assert.equal(p.refundedOre,25000);
assert.equal(p.state,"partial");
assert.equal(vippsDemoTotals(p).netOre,25000);
assert.equal(vippsDemoTotals(p).outstandingOre,100000);
assert.equal(canRunVippsDemo(p,"full"),false,"Demo cannot silently overwrite a refund by topping up");
p=advanceVippsDemo(p,"refund-all");
assert.equal(p.state,"refunded");
assert.equal(p.refundedOre,50000);
assert.equal(vippsDemoTotals(p).netOre,0);
assert.equal(vippsDemoTotals(p).outstandingOre,125000);
assert.equal(canRunVippsDemo(p,"receipt-sent"),false,"No receipt for completely refunded payment");
const reset=advanceVippsDemo(p,"reset");
assert.equal(reset.state,"idle");assert.equal(reset.refundedOre,0);
let full=advanceVippsDemo(advanceVippsDemo(reset,"start"),"full");
assert.equal(full.state,"paid");assert.equal(full.capturedOre,125000);
assert.equal(vippsDemoTotals(full).outstandingOre,0);
full=advanceVippsDemo(full,"receipt-sent");
assert.equal(full.receiptState,"sent");
full=advanceVippsDemo(full,"refund-part");
assert.equal(full.state,"partial");
assert.equal(vippsDemoTotals(full).outstandingOre,62500);
full=advanceVippsDemo(full,"refund-all");
assert.equal(full.state,"refunded");
assert.equal(vippsDemoTotals(full).netOre,0);
const tiny=advanceVippsDemo(advanceVippsDemo(createVippsDemo(100),"start"),"full");
assert.equal(vippsDemoTotals(tiny).netOre,100);
const odd=advanceVippsDemo(advanceVippsDemo(createVippsDemo(201),"start"),"partial");
assert.ok(odd.capturedOre>=1&&odd.capturedOre<201);
for(const amount of [100,201,125000,DEMO_MAX_ORE]){
 const fresh=createVippsDemo(amount);
 for(const action of ["partial","full","cancel","refund-part","refund-all","receipt-error","receipt-sent"]){
  const progressed=advanceVippsDemo(fresh,action);
  const totals=vippsDemoTotals(progressed);
  assert.ok(totals.netOre>=0&&totals.netOre<=amount,"Never exceed the simulated invoice amount");
 }
}
const page=readFileSync("app/admin/vipps/test/page.js","utf8");
const client=readFileSync("app/admin/vipps/test/VippsInvoiceDemoClient.js","utf8");
const navigation=readFileSync("app/admin/vipps/VippsStatusClient.js","utf8");
const paymentPanel=readFileSync("app/admin/faktura/InvoiceVippsPanel.js","utf8");
assert.ok(page.includes('getAdminUser()'),"Route needs authenticated admin");
assert.ok(page.includes('user.role==="owner"||user.canUpdateOrders'),"Only authorized staff may view demo");
assert.ok(page.includes('redirect("/admin/login")'),"No unauthenticated demo");
assert.ok(navigation.includes('href="/admin/vipps/test"'),"Demo discoverable from Vipps setup");
assert.ok(paymentPanel.includes('href="/admin/vipps/test"'),"Demo discoverable from invoice panel");
assert.ok(client.includes("advanceVippsDemo"),"Visible demo must use same tested state machine");
assert.ok(client.includes("Ingen knapper her kontakter Vipps"),"Explicit no-side-effects warning");
for(const codeFile of [source,client]){
 assert.doesNotMatch(codeFile,/\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b|\bWebSocket\b/,"No payment/API/network calls in demo");
 assert.doesNotMatch(codeFile,/\b(localStorage|sessionStorage|indexedDB)\b/,"Demo not persisted to browser storage");
 assert.doesNotMatch(codeFile,/\b(alert|window\.open|navigator\.share)\s*\(/,"Demo cannot send or share");
}
assert.ok(!page.includes("startInvoiceVipps"),"Demo must be independent of actual Vipps API");
console.log("Vipps prøvekjøring bestått: fiktiv betaling, delbetaling, avbrudd, refusjoner, kvitteringsfeil, tilgang og ingen nettverk/lagring.");
