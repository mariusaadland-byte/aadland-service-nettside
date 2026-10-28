import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const settlementSource=read("lib/vatSettlementPreview.js").replace(/^export /gm,"");
const {vatSettlementPreview}=new Function(settlementSource+";return {vatSettlementPreview};")();
const cases=[
 {comparison:{outputVatOre:125000,inputVatOre:42000,differenceOre:83000,estimateAllowed:true},
  direction:"payable",amount:83000},
 {comparison:{outputVatOre:15000,inputVatOre:42000,differenceOre:-27000,estimateAllowed:true},
  direction:"receivable",amount:27000},
 {comparison:{outputVatOre:15000,inputVatOre:15000,differenceOre:0,estimateAllowed:true},
  direction:"balanced",amount:0}
];
for(const test of cases){
 const result=vatSettlementPreview(test.comparison);
 assert.equal(result.direction,test.direction);
 assert.equal(result.amountOre,test.amount);
}
assert.equal(vatSettlementPreview({outputVatOre:42000,inputVatOre:80000,
 differenceOre:-38000,estimateAllowed:false}),null,
 "Unknown VAT registration must never present a refund claim");
assert.equal(vatSettlementPreview({outputVatOre:42000,inputVatOre:80000,
 differenceOre:20000,estimateAllowed:true}),null,
 "Inconsistent VAT numbers must never present a payment claim");
const status=read("app/admin/faktura/mva/VatQuickBalance.js");
const page=read("app/admin/faktura/mva/InvoiceVatTermClient.js");
const css=read("app/admin/faktura/mva/VatTermPage.module.css");
assert.ok(page.includes('const [view,setView]=useState("receipt")'),
 "The initial user experience is the receipt scanner");
assert.ok(page.includes('view!=="overview"&&<VatQuickBalance report={report} settlement={settlement}'),
 "Quick VAT status must also appear on the initial receipt tab");
assert.ok(page.includes('onDetails={()=>showView("overview")}'));
assert.ok(page.includes('onRefresh={()=>setReload(n=>n+1)}'),
 "User can refresh the current term's VAT after entering new receipts");
assert.ok(page.includes('const settlement=report?vatSettlementPreview(report.comparison):null'),
 "Use the already-guarded VAT balance, never raw unverified amounts");
assert.ok(page.includes('onChanged={onDocumentSaved}'),"New purchases reload the report");
assert.ok(status.includes('Du ligger an til å betale MVA'));
assert.ok(status.includes('Du ligger an til å få MVA tilbake'));
assert.ok(status.includes('Foreløpig i balanse'));
assert.ok(status.includes('Beløp å betale / til gode vises ikke ennå.'));
assert.ok(status.includes('report.registrationReview?.message'));
assert.ok(status.includes('output-input===comparison.differenceOre'),
 "The breakdown should only show internally consistent values");
assert.ok(status.includes('report.purchases?.documentCount??0'),
 "Reveal how many purchases are actually counted");
assert.ok(status.includes('ikke et betalingskrav eller bekreftet tilgodebeløp'));
assert.ok(status.includes('Manglende bilag fra andre systemer'));
assert.ok(css.includes(".balancePanel")&&css.includes(".balanceAmount"));
assert.ok(page.includes('view==="overview"'),"Existing detailed MVA report remains available");
console.log("MVA-status på kvitteringssiden bestått: betale, til gode, balanse, ukjent registrering og sikker oppdatering.");
