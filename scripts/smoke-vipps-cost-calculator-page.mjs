import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
const read=x=>readFileSync(x,"utf8");
const base=read("lib/vippsFeeEstimate.js").replace(/^export /gm,"");
const impl=new Function(base+";return {vippsFeeEstimateForPayments,vippsPriceForPayoutWithPayments};")();
const src=read("lib/vippsCostCalculator.js")
 .replace(/^import \{[\s\S]*?\} from "\.\/vippsFeeEstimate";\n/,"")
 .replace(/^export /gm,"");
const {parseVippsCostOre,parseVippsRateBps,calculateVippsCostPreview,
 VIPPS_COST_PAYMENT_PLANS}=new Function(
  "vippsFeeEstimateForPayments","vippsPriceForPayoutWithPayments",
  src+";return {parseVippsCostOre,parseVippsRateBps,calculateVippsCostPreview,VIPPS_COST_PAYMENT_PLANS};"
 )(impl.vippsFeeEstimateForPayments,impl.vippsPriceForPayoutWithPayments);
for(const [v,ore] of [
 ["1000",100000],["1 000,00",100000],["1000,50",100050],
 ["0,01",1],["0",0],["2 000,00",200000],["1.5",150]
])assert.equal(parseVippsCostOre(v),ore,"Norwegian amount "+v);
for(const invalid of ["", "1,001","1,2,3","-1","12kr","abc","99999999999999999"])
 assert.equal(parseVippsCostOre(invalid),null,"Must reject invalid amount "+invalid);
assert.equal(parseVippsRateBps("2,99"),299);
assert.equal(parseVippsRateBps("0"),0);
assert.equal(parseVippsRateBps("99,99"),9999);
for(const invalid of ["100","-1","2,999","x",""])
 assert.equal(parseVippsRateBps(invalid),null,"Must reject invalid fee "+invalid);
const invoice=calculateVippsCostPreview({
 type:"invoice",price:"1 000,00",rate:"2,99",fixed:"1,00",plan:"once"
});
assert.equal(invoice.ok,true);
assert.equal(invoice.amountOre,100000);
assert.equal(invoice.feeOre,3090);
assert.equal(invoice.payoutOre,96910);
assert.equal(invoice.paymentCount,1);
const split=calculateVippsCostPreview({
 type:"invoice",price:"1 000,00",plan:"three"
});
assert.equal(split.ok,true);
assert.deepEqual(split.shares,[25,50,25]);
assert.equal(split.paymentCount,3);
assert.ok(split.feeOre>invoice.feeOre,"Three payments pay three fixed fees");
assert.equal(split.payoutOre+split.feeOre,split.amountOre);
const rental=calculateVippsCostPreview({
 type:"rental",price:"1 500,00",deposit:"2 000,00",plan:"three"
});
assert.equal(rental.ok,true);
assert.equal(rental.depositOre,200000);
assert.equal(rental.amountOre,150000);
assert.equal(rental.feeBaseOre,150000,"Rental deposit must not enter sales fee base");
assert.equal(rental.paymentCount,1,"Rental fee estimated on rental price only");
assert.equal(rental.feeOre,4585);
assert.equal(rental.payoutOre,145415);
const changedDeposit=calculateVippsCostPreview({
 type:"rental",price:"1 500,00",deposit:"5 000,00"
});
assert.equal(changedDeposit.feeOre,rental.feeOre,
 "Changing refundable deposit must never affect rental fee estimate");
const reverse=calculateVippsCostPreview({
 type:"invoice",price:"1000",plan:"three",desired:"1000"
});
assert.equal(reverse.ok,true);
assert.ok(reverse.suggested.payoutOre>=100000);
assert.ok(impl.vippsFeeEstimateForPayments(
 reverse.suggested.amountOre-1,[25,50,25],
 {rateBps:299,fixedOre:100}
).payoutOre<100000,"Proposed price must be minimum after øre rounding");
for(const invalid of [
 {type:"invoice",price:"abc"},
 {type:"invoice",price:"1,999"},
 {type:"rental",price:"1000",deposit:"-1"},
 {type:"invoice",price:"1000",rate:"110"},
 {type:"invoice",price:"1000",fixed:"abc"},
 {type:"invoice",price:"1000",plan:"missing"},
 {type:"invoice",price:"1000",desired:"0"}
])assert.equal(calculateVippsCostPreview(invalid).ok,false,
 "Reject invalid calculator inputs: "+JSON.stringify(invalid));
const page=read("app/admin/vipps-kostnadskalkulator/page.js");
assert.ok(page.includes('user.role!=="owner"'),"Only the owner may use the admin calculator");
assert.ok(page.includes("getAdminUser"));
assert.ok(page.includes("VippsCostCalculatorClient"));
const ui=read("app/admin/vipps-kostnadskalkulator/VippsCostCalculatorClient.js");
for(const marker of [
 "Faktura","Utleie","Fakturabeløp inkl. MVA","Leiebeløp inkl. MVA",
 "Depositum (kr) – holdes utenfor","Vipps-gebyr (%)",
 "Fastgebyr per betaling","Forventet utbetalt fra Vipps",
 "Regn baklengs fra ønsket utbetaling","Foreslått kundepris inkl. MVA",
 "Prisgrunnlag fra Vipps-portalen","Ingen betaling opprettes",
 "Ingen data overføres til Tripletex","calculateVippsCostPreview",
 'aria-live="polite"'
])assert.ok(ui.includes(marker),"Missing cost calculator label: "+marker);
assert.ok(!/fetch\(|axios|method:"POST"|method:'POST'/.test(ui),
 "This cost calculator must not post payments or mutate invoices");
const css=read("app/admin/vipps-kostnadskalkulator/vippsCostCalculator.module.css");
assert.ok(css.includes("max-width:850px"));
assert.ok(css.includes("max-width:480px"));
assert.ok(css.includes("grid-template-columns:minmax(0,1fr)"));
const mapping=read("lib/developmentTaskLinks.js");
assert.ok(mapping.includes(
 '"custom-vipps-fee-price-preview-20261022":"/admin/vipps-kostnadskalkulator"'
),"Approval wizard must open the actual cost calculator");
const nav=read("app/admin/AdminClient.js");
assert.ok(nav.includes('["vippsCostCalculator","Vipps-kostnadskalkulator"]'));
assert.ok(nav.includes('router.push("/admin/vipps-kostnadskalkulator")'));
assert.ok(read("app/admin/faktura/InvoicesClient.js").includes(
 '<Link href="/admin/vipps-kostnadskalkulator">Vipps-kostnad og utbetaling</Link>'));
assert.ok(read("app/admin/utleie/RentalInventoryClient.js").includes(
 '<Link href="/admin/vipps-kostnadskalkulator">Vipps-kostnad og utbetaling</Link>'));
assert.ok(existsSync("app/admin/vipps-kostnadskalkulator/page.js"));
console.log("Vipps kostnadskalkulator bestått: faktura, flere betalinger, utleie uten depositum, gebyrsats, omvendt pris, øreavrunding, meny, godkjenningstest og read-only.");
