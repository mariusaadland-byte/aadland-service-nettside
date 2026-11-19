import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const src=read("lib/vippsReadOnlyReconciliation.js").replace(/^export /gm,"");
const {tripletexOpenBalance,vippsReconciliationOverview}=
 new Function(src+";return {tripletexOpenBalance,vippsReconciliationOverview};")();
const acc=150,customer=10009,day="2026-10-24";
const make=(id,date,amount,voucherId)=>({
 id,date,amountGross:amount,account:{id:acc},customer:{id:customer},
 voucher:{id:voucherId},description:"Test"
});
const postings=[
 make(1,"2026-10-23",1,42),
 make(2,"2026-10-23",-1.03,706508650),
 make(3,"2026-10-24",1,43),
 make(4,"2026-10-24",-1.03,706508689)
];
const open=tripletexOpenBalance(postings,acc,customer,day);
assert.equal(open.balanceOre,-6);
assert.equal(open.rows.length,4);
assert.throws(()=>tripletexOpenBalance([
 {...postings[0],customer:{id:1}}],acc,customer,day),/uklart/);
assert.throws(()=>tripletexOpenBalance([
 {...postings[0],amountGross:1.001}],acc,customer,day),/uklart/);
assert.throws(()=>tripletexOpenBalance([
 postings[0],postings[0]],acc,customer,day),/uklart/);
assert.throws(()=>tripletexOpenBalance([
 {...postings[0],date:"2026-11-20"}],acc,customer,day),/uklart/);
const funds=[
 {date:"2026-10-23",type:"capture",amountOre:100,balanceAfter:100},
 {date:"2026-10-23",type:"fees-retained",pspReference:"fee-23",
  amountOre:-103,balanceAfter:-3},
 {date:"2026-10-24",type:"capture",amountOre:100,balanceAfter:97},
 {date:"2026-10-24",type:"fees-retained",pspReference:"fee-24",
  amountOre:-103,balanceAfter:-6}
];
const fees=[
 {date:"2026-10-23",pspReference:"fee-23",amount_ore:103,status:"confirmed",tripletex_voucher_id:706508650},
 {date:"2026-10-24",pspReference:"fee-24",amount_ore:103,status:"confirmed",tripletex_voucher_id:706508689}
];
const balanced=vippsReconciliationOverview({funds,fees,payouts:[],
 balanceOre:open.balanceOre,complete:true});
assert.equal(balanced.status,"balance_matches");
assert.equal(balanced.balancesMatch,true);
assert.equal(balanced.differenceOre,0);
assert.equal(balanced.confirmedCount,2);
assert.equal(balanced.missingCount,0);
assert.equal(balanced.reviewCount,0);
assert.equal(balanced.fees[0].voucherId,706508650);
assert.equal(vippsReconciliationOverview({funds,fees,payouts:[],
 balanceOre:0,complete:true}).status,"review");
assert.equal(vippsReconciliationOverview({funds,fees:fees.slice(0,1),payouts:[],
 balanceOre:-6,complete:true}).missingCount,1);
assert.equal(vippsReconciliationOverview({funds,fees,payouts:[],
 balanceOre:-6,complete:false}).status,"review");
assert.equal(vippsReconciliationOverview({funds,fees,payouts:[],
 balanceOre:-6,complete:true,unknownEntryTypes:1}).status,"review");
const api=read("app/api/admin/tripletex/vipps-settlement/reconcile/route.js");
assert.ok(api.includes('user?.role!=="owner"'));
assert.ok(api.includes("tripletexRead(\"/ledger/posting/openPost?date=\""));
assert.ok(api.includes("customerAccountNumber=10009"));
assert.ok(api.includes("customerNumber)!==10009"));
assert.ok(api.includes("tripletexOpenBalance"));
assert.ok(!api.includes("export async function POST"));
assert.ok(!api.includes("tripletexCreateVippsSettlementVoucher"));
assert.ok(!api.includes("insert(")&&!api.includes("update(")&&!api.includes("delete("));
const panel=read("app/admin/faktura/mva/tripletex/VippsReconcilePanel.js");
assert.ok(panel.includes("Ingen bilag blir opprettet"));
assert.ok(panel.includes("check.status"));
const page=read("app/admin/faktura/mva/tripletex/VippsSettlementClient.js");
assert.ok(page.includes("<VippsReconcilePanel"));
assert.ok(page.includes("Sjekk Vipps og avstem mot Tripletex"));
assert.ok(page.includes("if(reconcileAfter)setReconcileAutoRunKey"));
console.log("Vipps / Tripletex saldokontroll: kr 2 inn, kr 2,06 gebyr, saldo -0,06; lesesikkerhet, differanser, ukjente og manglende poster bestått.");
