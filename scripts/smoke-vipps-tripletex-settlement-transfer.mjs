import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const source=read("lib/vippsTripletexPayoutPlan.js").replace(/^export /gm,"");
const {vippsPayoutPlan,payoutTripletexMarker,tripletexPayoutVoucher}=
 new Function(source+";return {vippsPayoutPlan,payoutTripletexMarker,tripletexPayoutVoucher};")();
const date="2026-11-18",id="302321-2000002";
const funds=[
 {date,type:"capture",reference:"invoice-epay-1",amountOre:10000,
  balanceBefore:0,balanceAfter:10000,pspReference:"a"},
 {date,type:"fees-retained",reference:"",amountOre:-200,
  balanceBefore:10000,balanceAfter:9800,pspReference:"b"},
 {date,type:"payout-scheduled",reference:"",amountOre:-9800,
  balanceBefore:9800,balanceAfter:0,pspReference:id}
];
const local=[{id:"localp1",vipps_reference:"invoice-epay-1",
 amount_ore:10000,reversed_at:null}];
const transferred=[{payment_id:"localp1",status:"confirmed",
 amount_ore:10000,payment_type_id:23}];
const plan=vippsPayoutPlan(funds,id,date,local,transferred);
assert.equal(plan.payoutOre,9800);
assert.equal(plan.grossOre,10000);
assert.equal(plan.feeOre,200);
assert.deepEqual(plan.references,["invoice-epay-1"]);
assert.equal(plan.paymentCount,1);
assert.equal(payoutTripletexMarker("service",id),"ASVP-service-"+id);
const voucher=tripletexPayoutVoucher({
 plan,unit:"service",customerId:175,customerAccountId:150,
 bankAccountId:192,feeAccountId:777
});
assert.equal(voucher.date,date);
assert.equal(voucher.postings.length,3);
assert.deepEqual(voucher.postings.map(x=>x.amountGross),[98,2,-100]);
assert.equal(voucher.postings[2].customer.id,175);
assert.equal(voucher.postings.reduce((n,p)=>n+p.amountGross,0),0);
assert.equal(voucher.postings.every(x=>x.vatType.id===0),true);
assert.equal(tripletexPayoutVoucher({
 plan:{...plan,feeOre:0,payoutOre:10000},
 unit:"service",customerId:175,customerAccountId:150,
 bankAccountId:192,feeAccountId:777
}).postings.length,2);
assert.throws(()=>vippsPayoutPlan(funds,id,date,local,[]),/bekreftet/);
assert.throws(()=>vippsPayoutPlan(funds,id,date,
 [{...local[0],amount_ore:5000}],transferred),/bekreftet/);
assert.throws(()=>vippsPayoutPlan(funds,id,date,
 [{...local[0],reversed_at:"2026-11-18"}],transferred),/bekreftet/);
assert.throws(()=>vippsPayoutPlan(funds,id,date,
 [local[0],local[0]],transferred),/bekreftet/);
assert.throws(()=>vippsPayoutPlan([
 {...funds[0],balanceBefore:100},
 funds[1],funds[2]
],id,date,local,transferred),/saldo|avvik/);
assert.throws(()=>vippsPayoutPlan([
 funds[0],{...funds[1],balanceAfter:9700},funds[2]
],id,date,local,transferred),/avvik/);
assert.throws(()=>vippsPayoutPlan([
 {...funds[0],type:"refund"},...funds.slice(1)
],id,date,local,transferred),/posttyper/);
assert.throws(()=>vippsPayoutPlan([
 ...funds.slice(0,2),{...funds[2],balanceAfter:100}
],id,date,local,transferred),/saldo|avvik/);
assert.throws(()=>tripletexPayoutVoucher({
 plan:{...plan,grossOre:11000},unit:"service",
 customerId:175,customerAccountId:150,
 bankAccountId:192,feeAccountId:777
}),/Ugyldig|balanserer/);
assert.throws(()=>payoutTripletexMarker("other",id),/Ukjent/);

const route=read("app/api/admin/tripletex/vipps-transfer/route.js");
assert.ok(route.includes('user?.role!=="owner"'),"owner-only actions");
assert.ok(route.includes("sameOriginGuard(req)"),"CSRF guard required");
assert.ok(route.includes('body.bankReceived!==true'),"real bank receipt confirmation");
assert.ok(route.includes('body.notImportedPreviously!==true'),"preexisting imported settlement check");
assert.ok(route.includes('body.confirmed!==true'),"explicit user approval");
assert.ok(route.includes("vippsPayoutPlan(funds,payoutId,day"),
 "must re-fetch actual provider ledger, not trust client totals");
assert.ok(route.includes("tripletex_vipps_settlement_transfers"),
 "atomic unique payout claim");
assert.ok(route.includes('status:"needs_review"'),
 "ambiguous outcome must stop automatic retry");
assert.ok(route.includes("reviewVoucherDuplicate("));
assert.ok(route.includes('customerAccountNumber=10009'));
assert.ok(route.includes("tripletexCreateVippsSettlementVoucher"));
const api=read("lib/tripletexApi.js");
assert.ok(api.includes('"/ledger/voucher?sendToLedger=true"'));
assert.ok(api.includes("tripletexCreateVippsSettlementVoucher"));
const ui=read("app/admin/faktura/mva/tripletex/VippsTripletexTransferPanel.js");
assert.ok(ui.includes("Overfør oppgjørsbilaget til Tripletex"));
assert.ok(ui.includes("Kontroller for Tripletex"));
const page=read("app/admin/faktura/mva/tripletex/VippsSettlementClient.js");
assert.ok(page.includes("<VippsTripletexTransferPanel row={row} unit={result.unit}/>"));
const migration=read("supabase/migrations/20261119185000_tripletex_vipps_settlement_transfer_claims.sql");
assert.ok(migration.includes("unique(environment,unit,payout_psp_reference)"));
assert.ok(migration.includes("enable row level security"));
console.log("Vipps Tripletex voucher smoke bestått: forhåndskontroll, saldo, bokføringsbalanse, bekreftet betaling, kontoer, én gang, kun eier og sikker feilhåndtering.");
