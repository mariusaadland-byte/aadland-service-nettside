import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync("lib/vippsSettlementPeriod.js","utf8").replace(/^export /gm,"");
const {vippsPeriodBatches,combineVippsPeriodResponses}=
 new Function(src+";return {vippsPeriodBatches,combineVippsPeriodResponses};")();
const batches=vippsPeriodBatches("2026-10-01","2026-10-31");
assert.deepEqual(batches,[
 {from:"2026-10-01",to:"2026-10-07"},
 {from:"2026-10-08",to:"2026-10-14"},
 {from:"2026-10-15",to:"2026-10-21"},
 {from:"2026-10-22",to:"2026-10-28"},
 {from:"2026-10-29",to:"2026-10-31"}
]);
assert.deepEqual(vippsPeriodBatches("2026-02-01","2026-02-28").length,4);
assert.deepEqual(vippsPeriodBatches("2026-02-26","2026-03-04"),[
 {from:"2026-02-26",to:"2026-03-04"}
]);
assert.equal(vippsPeriodBatches("2026-10-01","2026-11-01").length,5,
 "More than one month is supported through weekly batches");
const fullYear2026=vippsPeriodBatches("2026-01-01","2026-12-31");
assert.equal(fullYear2026.length,53,"365 days should be fetched in 53 seven-day chunks");
assert.deepEqual(fullYear2026.at(-1),{from:"2026-12-31",to:"2026-12-31"});
const leapYear2024=vippsPeriodBatches("2024-01-01","2024-12-31");
assert.equal(leapYear2024.length,53,"Leap year with 366 days must be supported");
assert.deepEqual(leapYear2024.at(-1),{from:"2024-12-30",to:"2024-12-31"});
assert.equal(vippsPeriodBatches("2026-01-01","2027-01-02"),null,
 "367 days must be rejected");
assert.equal(vippsPeriodBatches("2026-01-01","2026-01-01",{limitDays:500}),null,
 "The optional limitDays cannot remove the absolute one-year bound");
assert.equal(vippsPeriodBatches("2026-02-30","2026-03-01"),null);
assert.equal(vippsPeriodBatches("2026-11-18","2026-11-12"),null);
const totals={
 capturesOre:100,refundsOre:-10,retainedFeesOre:-5,
 feesChargedOre:-5,payoutScheduledOre:85,payoutAbortedOre:0,
 numberOfCaptures:1,numberOfRefunds:1,numberOfFees:1,numberOfPayouts:1
};
const parts=batches.map((batch,i)=>({
 ok:true,unit:"service",...batch,ledgerMatched:true,tripletexConnected:true,
 totals,payoutRows:[{date:batch.from,amountOre:85,reference:"p"+i}],
 matching:[{reference:i<2?"shared":"ref-"+i,capturedOre:100,count:1,
  status:"tripletex-bekreftet"}],
 unreferencedCaptures:0,unknownEntryTypes:0
}));
const combined=combineVippsPeriodResponses(parts,batches,"service");
assert.equal(combined.totals.capturesOre,500);
assert.equal(combined.totals.refundsOre,-50);
assert.equal(combined.totals.payoutScheduledOre,425);
assert.equal(combined.totals.numberOfCaptures,5);
assert.equal(combined.payoutRows.length,5);
assert.equal(combined.matching.length,4);
assert.equal(combined.matching.find(x=>x.reference==="shared").capturedOre,200);
assert.equal(combined.matching.find(x=>x.reference==="shared").status,
 "ingen-sikker-kobling","Cross-week duplicate references must not claim a confirmed accounting match");
assert.equal(combined.matching.find(x=>x.reference==="ref-2").status,"tripletex-bekreftet");
assert.equal(combined.from,"2026-10-01");
assert.equal(combined.to,"2026-10-31");
assert.equal(combined.postingEnabled,false);
assert.equal(combined.matchingLimited,false);
assert.equal(combineVippsPeriodResponses(
 parts.map((p,i)=>i===2?{...p,matchingLimited:true}:p),
 batches,"service").matchingLimited,true,
 "Hidden detailed references must be disclosed for a large report");
assert.throws(()=>combineVippsPeriodResponses(parts.slice(0,4),batches,"service"),
 /Ufullstendige/);
assert.throws(()=>combineVippsPeriodResponses(
 parts.map((p,i)=>i===3?{...p,from:"2026-10-20"}:p),batches,"service"),
 /ufullstendig|feil periode/);
assert.throws(()=>combineVippsPeriodResponses(parts,batches,"rental"),
 /ufullstendig|feil periode/);
assert.throws(()=>combineVippsPeriodResponses(
 parts.map((p,i)=>i===4?{...p,totals:{...totals,capturesOre:"100"}}:p),
 batches,"service"),/Ugyldig summering/);
const ui=readFileSync("app/admin/faktura/mva/tripletex/VippsSettlementClient.js","utf8");
assert.ok(ui.includes('vippsPeriodBatches(from,to)'));
assert.ok(ui.includes("366 dager"));
assert.ok(ui.includes("Velg regnskapsår"));
assert.ok(ui.includes("Avbryt henting"));
assert.ok(ui.includes("controller.signal"));
assert.ok(ui.includes("Henter uke "));
assert.ok(ui.includes("parts.push(data)"));
assert.ok(ui.includes("combineVippsPeriodResponses(parts,batches,unit)"));
assert.ok(ui.includes("Ingen samlet rapport blir vist"));
const api=readFileSync("app/api/admin/tripletex/vipps-settlement/route.js","utf8");
assert.ok(api.includes("vippsRange(start,end,7)"),
 "Server should retain safe seven-day read-only limit");
assert.ok(!api.includes("export async function POST"));
console.log("Vipps årsoppgjør bestått: 365/366 dager i 53 sikre API-bolker, kansellering, eksakte ørebeløp og ingen delvise rapporter.");
