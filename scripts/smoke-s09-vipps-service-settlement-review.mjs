import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=x=>readFileSync(x,"utf8");
const src=read("lib/vippsServiceSettlementReview.js").replace(/^export /gm,"");
const {vippsServiceSettlementReview}=new Function(src+";return {vippsServiceSettlementReview};")();
const cached={unit:"service",complete:true,from:"2026-01-01",to:"2026-11-18",
 storedDays:322,totalDays:322,lastCheckedAt:"2026-11-19T21:49:27.372Z"};
const fee=(day,ref)=>({date:day,pspReference:ref,kind:"trukket",
 amountOre:103,tripletexStatus:"confirmed",transferMismatch:false});
const base={
 from:cached.from,to:cached.to,
 feeRows:[fee("2026-10-23","1711207-20261023"),fee("2026-10-24","1711207-20261024")],
 payoutRows:[],
 totals:{capturesOre:200,refundsOre:0,retainedFeesOre:-206,
  payoutScheduledOre:0,numberOfPayouts:0,numberOfRefunds:0},
 lastVippsBalanceOre:-6,lastVippsBalanceDate:"2026-10-24",unknownEntryTypes:0
};
const review=(report=base,cacheInfo=cached,unit="service")=>
 vippsServiceSettlementReview({unit,cacheInfo,report});
const settled=review();
assert.equal(settled.status,"no_payout","No planned payout means zero bank settlement transfers need no invented entry");
assert.equal(settled.feesConfirmed,2);
assert.equal(settled.feeCount,2);
assert.equal(settled.payoutCount,0);
assert.equal(settled.payoutsConfirmed,0);
assert.equal(settled.pendingPayouts,0);
assert.equal(settled.retainedFeesOre,-206);
assert.equal(settled.capturesOre,200);
assert.equal(settled.netObservedOre,-6);
assert.equal(settled.lastVippsBalanceOre,-6);
assert.ok(settled.message.includes("ikke i seg selv et avvik"));
assert.equal(review(base,cached,"rental"),null,"Never touch rental settlement");
assert.equal(review(base,{...cached,complete:false,storedDays:321}).status,"incomplete");
assert.equal(review(base,{...cached,complete:true,storedDays:321}).status,"incomplete");
assert.equal(review(null).status,"missing");
assert.equal(review({...base,feeRows:base.feeRows.slice(0,1)}).status,"review",
 "Missing actual fee evidence cannot be treated as confirmed");
assert.equal(review({...base,feeRows:[{...base.feeRows[0],transferMismatch:true},base.feeRows[1]]}).status,"fee_review");
assert.equal(review({...base,feeRows:[{...base.feeRows[0],tripletexStatus:"needs_review"},base.feeRows[1]]}).status,"fee_review");
assert.equal(review({...base,unknownEntryTypes:1}).status,"review");
assert.equal(review({...base,lastVippsBalanceOre:null}).status,"review");
const payout={date:"2026-11-18",pspReference:"payout-1234",amountOre:100,
 tripletexStatus:"not_transferred",transferMismatch:false};
const withPayout={...base,payoutRows:[payout],
 totals:{...base.totals,payoutScheduledOre:100,numberOfPayouts:1}};
assert.equal(review(withPayout).status,"payout_review","Scheduled payout requires manual bank proof");
assert.equal(review({...withPayout,payoutRows:[{...payout,tripletexStatus:"confirmed"}]}).status,
 "payout_recorded","Locally confirmed payout is not again listed as pending to post");
assert.equal(review({...withPayout,totals:base.totals}).status,"review",
 "Payout amount mismatch must not be accepted");
assert.equal(review({...base,feeRows:[]}).status,"review","Missing retained fee rows must flag report inconsistency");
assert.equal(review({...base,feeRows:[],totals:{...base.totals,capturesOre:0,retainedFeesOre:0},
 lastVippsBalanceOre:0}).status,"no_activity");
const ui=read("app/admin/faktura/mva/tripletex/VippsServiceSettlementReview.js");
const page=read("app/admin/faktura/mva/tripletex/VippsSettlementClient.js");
assert.ok(page.includes('unit==="service"&&cacheInfo&&'));
assert.ok(page.includes("<VippsServiceSettlementReview"));
assert.ok(ui.includes("Ingen poster bokføres eller matches automatisk"));
assert.ok(ui.includes("Saldokontroll mot Tripletex"));
assert.ok(ui.includes("Gjelder kun den valgte perioden"));
const endpoint=read("app/api/admin/tripletex/vipps-settlement/reconcile/route.js");
assert.ok(endpoint.includes('user?.role!=="owner"'));
assert.ok(!endpoint.includes("export async function POST"));
assert.ok(endpoint.includes("tripletexOpenBalance"));
const reconciliation=read("lib/vippsReadOnlyReconciliation.js");
assert.ok(reconciliation.includes("matching balances do not close open postings"));
console.log("S-09 bestått: 2 x 1 kr Vipps, 2 x 1,03 kr gebyr, saldo -0,06 kr, ingen planlagt utbetaling, ingen fiktiv bankføring, kun Service og manuell Tripletex-avstemming.");
