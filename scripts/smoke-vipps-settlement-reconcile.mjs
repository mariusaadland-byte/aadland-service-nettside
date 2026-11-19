import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const src=read("lib/vippsSettlementReconcile.js").replace(/^export /gm,"");
const {vippsRange,matchingLedger,normalizeReportEntries,vippsSettlementSummary}=
 new Function(src+";return {vippsRange,matchingLedger,normalizeReportEntries,vippsSettlementSummary};")();
assert.deepEqual(vippsRange("2026-11-12","2026-11-18"),[
 "2026-11-12","2026-11-13","2026-11-14","2026-11-15",
 "2026-11-16","2026-11-17","2026-11-18"]);
assert.equal(vippsRange("2026-11-12","2026-11-19"),null);
assert.equal(vippsRange("2026-11-18","2026-11-12"),null);
assert.equal(vippsRange("2026-02-30","2026-03-01"),null);
assert.deepEqual(matchingLedger([
 {ledgerId:"301",currency:"NOK",settlesForRecipientHandles:["api:123456"]},
 {ledgerId:"302",currency:"NOK",settlesForRecipientHandles:["api:999999"]}
],"123456"),{ok:true,ledgerId:"301"});
assert.equal(matchingLedger([{ledgerId:"301",currency:"NOK",
 settlesForRecipientHandles:["NO:123456"]}],"123456").ok,false,
 "Vippsnummer credentials must not be treated as ePayment report access");
assert.equal(matchingLedger([
 {ledgerId:"301",currency:"NOK",settlesForRecipientHandles:["api:123456"]},
 {ledgerId:"302",currency:"NOK",settlesForRecipientHandles:["api:123456"]}
],"123456").ok,false,"Never select an ambiguous settlement ledger");
const raw=[
 {entryType:"capture",amount:10000,currency:"NOK",ledgerDate:"2026-11-18",
  reference:"pay-first",pspReference:"psp1"},
 {entryType:"capture",amount:15000,currency:"NOK",ledgerDate:"2026-11-18",
  reference:"pay-second",pspReference:"psp2"},
 {entryType:"refund",amount:-2000,currency:"NOK",ledgerDate:"2026-11-18",
  reference:"pay-old"},
 {entryType:"fees-retained",amount:-300,currency:"NOK",ledgerDate:"2026-11-18"},
 {entryType:"payout-scheduled",amount:-22700,currency:"NOK",ledgerDate:"2026-11-18",
  pspReference:"301-17"}
];
const funds=normalizeReportEntries(raw,"funds");
const fees=normalizeReportEntries([
 {entryType:"capture-fee",amount:-300,currency:"NOK",ledgerDate:"2026-11-18",
  pspReference:"psp1"}
],"fees");
assert.throws(()=>normalizeReportEntries([{entryType:"capture",amount:"100.00",
 currency:"NOK",ledgerDate:"2026-11-18"}],"funds"));
assert.throws(()=>normalizeReportEntries([{entryType:"capture",amount:100,
 currency:"EUR",ledgerDate:"2026-11-18"}],"funds"));
const summary=vippsSettlementSummary(funds,fees,[
 {reference:"pay-first",amountOre:10000,paymentId:"id-one",reversed:false},
 {reference:"pay-second",amountOre:15000,paymentId:"id-two",reversed:false}
],[{payment_id:"id-one",status:"confirmed",amount_ore:10000}]);
assert.equal(summary.totals.capturesOre,25000);
assert.equal(summary.totals.refundsOre,-2000);
assert.equal(summary.totals.retainedFeesOre,-300);
assert.equal(summary.totals.payoutScheduledOre,22700);
assert.equal(summary.totals.numberOfPayouts,1);
assert.equal(summary.matching.find(x=>x.reference==="pay-first").status,"tripletex-bekreftet");
assert.equal(summary.matching.find(x=>x.reference==="pay-second").status,"funnet-i-aadland");
assert.match(summary.payoutRows[0].note,/ikke bekreftet bankinnskudd/);
assert.equal(summary.matchingLimited,false);
const lots=Array.from({length:251},(_,i)=>({
 topic:"funds",type:"capture",amountOre:100,date:"2026-11-18",
 reference:"annual-ref-"+i,pspReference:"",row:i
}));
const large=vippsSettlementSummary(lots,[]);
assert.equal(large.totals.capturesOre,25100,
 "Yearly settlement totals must include all report entries");
assert.equal(large.matching.length,250,
 "Server should keep the detail-view size bounded");
assert.equal(large.matchingLimited,true,
 "The UI must disclose that some references were hidden");
assert.equal(vippsSettlementSummary([
 ...funds,{type:"future-unknown-type",amountOre:100,date:"2026-11-18",
 reference:"",pspReference:"",topic:"funds"}],fees).unknownEntryTypes,1);
const route=read("app/api/admin/tripletex/vipps-settlement/route.js");
assert.ok(route.includes('user?.role!=="owner"'));
assert.ok(route.includes('vippsRange(start,end,7)'));
assert.ok(route.includes('vippsSettlementLedgers(unit)'));
assert.ok(route.includes('vippsSettlementEntries(unit,match.ledgerId,"funds",day)'));
assert.ok(route.includes('vippsSettlementEntries(unit,match.ledgerId,"fees",day)'));
assert.ok(route.includes("postingEnabled:false"));
assert.ok(route.includes("storedTripletexConnection(s)"));
assert.ok(!route.includes("export async function POST"));
assert.ok(!route.includes("tripletexRecordInvoicePayment")&&!route.includes("tripletexCreateVoucher"));
const client=read("lib/vippsClient.js");
assert.ok(client.includes('async function reportRead('));
assert.ok(client.includes('async function reportPages('));
assert.ok(client.includes("REPORT_NO_ACCESS"));
assert.ok(client.includes('accessToken(unit,{allowDisabled:true})'));
assert.ok(client.includes('config.environment!=="production"'));
const ui=read("app/admin/faktura/mva/tripletex/VippsSettlementClient.js");
assert.ok(ui.includes("Sjekk hva som er nytt fra Vipps"));
assert.ok(ui.includes("Ingen nye bilag er bokført"));
const page=read("app/admin/faktura/mva/tripletex/page.js");
assert.ok(page.includes("<VippsSettlementClient/>"));
console.log("Vipps-oppgjør bestått: dokumentert Report API, salgsstedsperre, dagområde, signerte ørebeløp, refusjoner, gebyrer, planlagte utbetalinger og kun lesing.");
