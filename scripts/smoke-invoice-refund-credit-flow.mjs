import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Pure validation and rendering contracts, no Vipps calls, refunds, sends or database writes.
const parseSource=readFileSync("lib/invoiceRefundAmount.js","utf8").replace(/^export /gm,"");
const parse=new Function(parseSource+";return parseRefundAmountOre;")();
assert.equal(parse("125,50",12550),12550,"Norwegian comma decimals");
assert.equal(parse("125.50",12550),12550,"Dot decimals");
assert.equal(parse("125,5",12550),12550,"One decimal");
assert.equal(parse("125",12500),12500,"Whole kroner");
assert.equal(parse(" 0,01 ",1),1,"Minimum unit is one øre");
assert.equal(parse("001,05",105),105);
for(const value of ["0","0,00","-1","1,234","1e3","1 000","1,","",null,"NaN","\\d","999999999999999999"]){
 assert.throws(()=>parse(value,20000),undefined,"Invalid amount should fail: "+String(value));
}
assert.throws(()=>parse("125,51",12550),/kan ikke overstige/);
assert.throws(()=>parse("125,50",0),/kan ikke overstige/);
assert.throws(()=>parse("1",NaN),/kan ikke overstige/);

const remainingSource=readFileSync("lib/invoiceCreditRemaining.js","utf8").replace(/^export /gm,"");
const remaining=new Function(remainingSource+";return invoiceCreditRemainingQuantities;")();
const originalLines=[{quantity:2},{quantity:1},{quantity:0.375}];
const history=[
 {lines:[{sourceIndex:0,quantity:0.5},{sourceIndex:2,quantity:0.125}]},
 {lines:[{sourceIndex:0,quantity:0.25},{sourceIndex:1,quantity:1}]}
];
assert.deepEqual(remaining(originalLines,history),[1.25,0,0.25],
 "Previously credited quantities must be deducted per original line");
assert.deepEqual(remaining(originalLines,[]),[2,1,0.375]);
assert.deepEqual(remaining(originalLines,[{lines:[{sourceIndex:0,quantity:20}]}]),[0,1,0.375]);

const refundUI=readFileSync("app/admin/faktura/InvoiceVippsPanel.js","utf8");
assert.ok(refundUI.includes('parseRefundAmountOre(entered,available)'),"Refund flow uses validated integer øre");
assert.ok(!refundUI.includes(String.raw`!/^\\d`),"Broken double-escaped regex is not allowed");
assert.ok(refundUI.includes('href="#invoice-credit-note"'),"Refund receipt links to credit-note section");
assert.ok(refundUI.indexOf('}{refundMessage&&')>refundUI.indexOf(' </section>}{refundMessage&&')-1,
 "Refund success remains visible after full payment is refunded");
const creditUI=readFileSync("app/admin/faktura/InvoiceCreditNotePanel.js","utf8");
assert.ok(creditUI.includes("invoiceCreditRemainingQuantities(invoice.line_items,notes)"));
assert.ok(creditUI.includes('id="invoice-credit-note"'),"Refund link has a working destination");
assert.ok(creditUI.includes('n.lines||[]'),"Already credited lines are displayed");
assert.ok(creditUI.includes("Vipps-refusjon finner du"),"Full-paid invoice explains refund-first workflow");
const creditAPI=readFileSync("app/api/admin/invoices/credit-notes/route.js","utf8");
assert.ok(creditAPI.includes("reason,lines,subtotal_ore"),"Credit history loads saved line quantities");
console.log("Vipps-refusjon og kreditnota bestått: ørevalidering, delvis krediterte linjer, synlig fullrefusjon og snarvei.");
