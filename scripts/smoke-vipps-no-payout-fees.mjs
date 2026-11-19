import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const moduleA=read("lib/vippsTripletexFeePlan.js").replace(/^export /gm,"");
const {retainedVippsFeePlan,vippsFeeMarker,tripletexRetainedFeeVoucher}=
 new Function(moduleA+";return {retainedVippsFeePlan,vippsFeeMarker,tripletexRetainedFeeVoucher};")();
const moduleB=read("lib/vippsTripletexPayoutPlan.js").replace(/^export /gm,"");
const {vippsPayoutPlan,tripletexPayoutVoucher}=new Function(moduleB+
 ";return {vippsPayoutPlan,tripletexPayoutVoucher};")();
const moduleC=read("lib/vippsSettlementReconcile.js").replace(/^export /gm,"");
const {vippsSettlementSummary}=new Function(moduleC+
 ";return {vippsSettlementSummary};")();
const date="2026-10-23",feeId="fee-retained-23";
const funds=[
 {date,type:"capture",amountOre:100,reference:"one-krone",
  pspReference:"cap1",balanceBefore:0,balanceAfter:100},
 {date,type:"fees-retained",amountOre:-200,reference:"",
  pspReference:feeId,balanceBefore:100,balanceAfter:-100}
];
const fees=[
 {date,amountOre:200,type:"fees-retained",pspReference:feeId},
 {date,amountOre:-200,type:"capture-fee",reference:"one-krone",pspReference:"cap1"}
];
const plan=retainedVippsFeePlan(funds,fees,feeId,date);
assert.equal(plan.amountOre,200,"2 kr can be retained even on a 1 kr sale");
assert.equal(plan.bankPayoutOre,0,"No made-up payout");
assert.equal(plan.balanceAfterOre,-100,"Negative Vipps balance is preserved");
const voucher=tripletexRetainedFeeVoucher(plan,{unit:"service",
 customerId:10009,customerAccountId:150,feeAccountId:777});
assert.deepEqual(voucher.postings.map(x=>x.amountGross),[2,-2]);
assert.deepEqual(voucher.postings.map(x=>x.account.id),[777,150]);
assert.equal(voucher.postings[1].customer.id,10009);
assert.equal(voucher.postings.every(x=>x.vatType.id===0),true);
assert.equal(voucher.description,"Vipps gebyr "+vippsFeeMarker("service",feeId));
assert.ok(!voucher.postings.some(x=>x.account.id===1920),
 "No bank entry allowed for a fee-only voucher");
assert.throws(()=>retainedVippsFeePlan(funds,[],feeId,date),/samsvarende/);
assert.throws(()=>retainedVippsFeePlan(funds,[
 {...fees[0],amountOre:100}
],feeId,date),/stemmer ikke/);
assert.throws(()=>retainedVippsFeePlan([...funds,{
 date,type:"payout-scheduled",pspReference:"psp-1",amountOre:-1,
 balanceBefore:-100,balanceAfter:-101
}],fees,feeId,date),/utbetaling/);
assert.throws(()=>retainedVippsFeePlan([
 funds[0],{...funds[1],balanceAfter:0}
],fees,feeId,date),/stemmer ikke/);
const summary=vippsSettlementSummary(funds,fees,[],[]);
assert.equal(summary.totals.capturesOre,100);
assert.equal(summary.totals.retainedFeesOre,-200);
assert.equal(summary.totals.numberOfPayouts,0);
assert.equal(summary.feeRows.length,1);
assert.equal(summary.lastVippsBalanceOre,-100);
assert.equal(summary.lastVippsBalanceDate,date);
assert.equal(summary.feeRows[0].kind,"trukket");
assert.equal(summary.feeRows[0].amountOre,200);
const laterDate="2026-10-24",payoutId="payout-123";
const payoutFunds=[
 ...funds,
 {date:laterDate,type:"capture",amountOre:300,reference:"next-sale",
  pspReference:"cap2",balanceBefore:-100,balanceAfter:200},
 {date:laterDate,type:"payout-scheduled",amountOre:-200,
  pspReference:payoutId,balanceBefore:200,balanceAfter:0}
];
const local=[
 {id:"one",vipps_reference:"one-krone",amount_ore:100,reversed_at:null},
 {id:"two",vipps_reference:"next-sale",amount_ore:300,reversed_at:null}
];
const transfers=[
 {payment_id:"one",status:"confirmed",amount_ore:100},
 {payment_id:"two",status:"confirmed",amount_ore:300}
];
const payout=vippsPayoutPlan(payoutFunds,payoutId,laterDate,local,transfers);
assert.equal(payout.feeOre,200);
assert.deepEqual(payout.feeRows,[{pspReference:feeId,date,amountOre:200}]);
assert.equal(payout.payoutOre,200);
const laterVoucher=tripletexPayoutVoucher({plan:payout,unit:"service",
 customerId:10009,customerAccountId:150,feeAccountId:777,
 bankAccountId:192,previouslyBookedFeeOre:200});
assert.deepEqual(laterVoucher.postings.map(x=>x.amountGross),[2,-2],
 "Previously posted fee must not be debited a second time");
assert.deepEqual(laterVoucher.postings.map(x=>x.account.id),[192,150]);
assert.throws(()=>tripletexPayoutVoucher({plan:payout,unit:"service",
 customerId:10009,customerAccountId:150,feeAccountId:777,
 bankAccountId:192,previouslyBookedFeeOre:201}),/Ugyldig/);
const ui=read("app/admin/faktura/mva/tripletex/VippsSettlementClient.js");
assert.ok(ui.includes("Gebyrer trukket fra Vipps-saldo"));
assert.ok(ui.includes("<VippsRetainedFeeTransferPanel row={row} unit={result.unit}/>"));
const api=read("app/api/admin/tripletex/vipps-fees/route.js");
assert.ok(api.includes('user?.role!=="owner"'));
assert.ok(api.includes('sameOriginGuard(req)'));
assert.ok(api.includes('body.notImportedPreviously!==true'));
assert.ok(api.includes('status:"needs_review"'));
assert.ok(api.includes("acquireVippsAccountingLock"));
assert.ok(api.includes("retainedVippsFeePlan(funds,fees,feeId,day)"));
assert.ok(api.includes("tripletexCreateVippsSettlementVoucher"));
const payoutRoute=read("app/api/admin/tripletex/vipps-transfer/route.js");
assert.ok(payoutRoute.includes("previouslyBookedFeeOre"));
assert.ok(payoutRoute.includes("acquireVippsAccountingLock"));
// Regression: Tripletex filters by customerAccountNumber but returns customerNumber.
for(const source of [api,payoutRoute]){
 assert.ok(source.includes('customerAccountNumber=10009&count=10&fields=id,name,customerNumber'));
 assert.ok(source.includes('Number(customer.customerNumber)!==10009'));
 assert.ok(!source.includes('Number(customer.customerAccountNumber)!==10009'));
 assert.ok(source.includes('!/vipps/i.test(String(customer.name||""))'),
  "Do not accept another customer or bypass the dedicated Vipps customer check");
}
const provider=read("lib/tripletexApi.js");
assert.ok(provider.includes("gebyr ASVF-"));
const migration=read("supabase/migrations/20261119190000_tripletex_vipps_retained_fees.sql");
assert.ok(migration.includes("unique(environment,unit,ledger_id,fee_psp_reference)"));
assert.ok(migration.includes("enable row level security"));
console.log("Vipps gebyr uten utbetaling bestått: 1 kr salg, 2 kr trukket gebyr, negativ saldo, ingen bankføring, gebyr mot reskontro, ingen dobbel bokføring ved senere payout.");
