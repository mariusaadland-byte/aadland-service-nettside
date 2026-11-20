import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=x=>readFileSync(x,"utf8");
const source=read("lib/vippsFeeEstimate.js").replace(/^export /gm,"");
const {
 VIPPS_STANDARD_RATE_BPS,VIPPS_STANDARD_FIXED_ORE,
 VIPPS_INTEGRATED_PAYMENT_RATE_SOURCE,vippsFeeEstimate
}=new Function(source+
 ";return {VIPPS_STANDARD_RATE_BPS,VIPPS_STANDARD_FIXED_ORE,VIPPS_INTEGRATED_PAYMENT_RATE_SOURCE,vippsFeeEstimate};")();
assert.equal(VIPPS_STANDARD_RATE_BPS,299);
assert.equal(VIPPS_STANDARD_FIXED_ORE,100);
assert.equal(VIPPS_INTEGRATED_PAYMENT_RATE_SOURCE.product,"Integrert betaling");
assert.equal(VIPPS_INTEGRATED_PAYMENT_RATE_SOURCE.portalScreenshotDate,"2026-10-21");
assert.equal(VIPPS_INTEGRATED_PAYMENT_RATE_SOURCE.rateBps,299);
assert.equal(VIPPS_INTEGRATED_PAYMENT_RATE_SOURCE.fixedOre,100);
assert.equal(VIPPS_INTEGRATED_PAYMENT_RATE_SOURCE.signedContractRateVerified,false);
assert.equal(VIPPS_INTEGRATED_PAYMENT_RATE_SOURCE.rentalMerchantRateVerified,false);
assert.deepEqual(VIPPS_INTEGRATED_PAYMENT_RATE_SOURCE.serviceObservedDates,["2026-10-23","2026-10-24"]);
const captured=vippsFeeEstimate(100);
assert.equal(captured.feeOre,103,"1 kr test payment should match recorded retained fee of 1,03 kr");
assert.equal(captured.amountOre,100);
const ui=read("app/admin/vipps-kostnadskalkulator/VippsCostCalculatorClient.js");
const preview=read("app/admin/VippsFeePreview.js");
for(const text of [
 'VIPPS_STANDARD_RATE_BPS','VIPPS_STANDARD_FIXED_ORE',
 'Prisgrunnlag fra Vipps-portalen',
 'En eventuell individuell rabatt',
 'For Aadland Utleie er eventuell separat prisavtale ennå ikke kontrollert.',
 'To testoppgjør','signert avtale'
])assert.ok((ui+"\n"+preview).includes(text),"Missing fee provenance: "+text);
assert.ok(ui.includes("useState((VIPPS_STANDARD_RATE_BPS/100).toFixed(2)"));
assert.ok(ui.includes("useState((VIPPS_STANDARD_FIXED_ORE/100).toFixed(2)"));
assert.ok(preview.includes('useState((VIPPS_STANDARD_RATE_BPS/100).toFixed(2)'));
assert.ok(preview.includes('useState((VIPPS_STANDARD_FIXED_ORE/100).toFixed(2)'));
assert.ok(!ui.includes('kun et forhåndsutfylt\n      beregningseksempel'));
console.log("Vipps-prisgrunnlag verifisert: opplastet portalskjerm 21.10, 2,99 % + 1 kr; 1-kr test 23/24.10 med 1,03 kr gebyr; separat signert avtale ikke påstått.");
