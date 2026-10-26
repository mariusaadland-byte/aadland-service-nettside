import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const vat=readFileSync("lib/invoiceVatTermReport.js","utf8").replace(/^export /gm,"");
const term=new Function(vat+";return {vatTermBounds,buildInvoiceVatTermReport,invoiceVatTermCsv};")();
const source=readFileSync("lib/invoiceInputVat.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {parseKronerOre,oreToInput,validateVatPurchaseInput,calculateInputVatSummary,
 mergedVatReport,combinedVatCsv}=new Function("vatTermBounds",source+
 ";return {parseKronerOre,oreToInput,validateVatPurchaseInput,calculateInputVatSummary,mergedVatReport,combinedVatCsv};")(term.vatTermBounds);

const original={
 supplierName:"Megaflis",documentNumber:"INV 789",documentDate:"2026-10-24",
 kind:"purchase",evidenceReference:"Systemia bilag 46",
 businessPurpose:"Materialer brukt til kunder i virksomheten",deductionPercent:50,
 groups:{0:{base:"",vat:""},12:{base:"100,00",vat:"12,00"},
  15:{base:"",vat:""},25:{base:"200,00",vat:"50,00"}},
 documentConfirmed:true,deductionConfirmed:true,bankConditionConfirmed:false
};
const parsed=validateVatPurchaseInput(original);
assert.equal(parsed.base_ore,30000);
assert.equal(parsed.vat_ore,6200);
assert.equal(parsed.deductible_vat_ore,3100);
assert.equal(parsed.vat_groups[12].vatOre,1200);
assert.equal(parsed.vat_groups[25].baseOre,20000);
assert.equal(parsed.evidence_reference,"Systemia bilag 46");
assert.deepEqual(Object.keys(parsed.vat_groups).sort(),["12","25"]);
assert.equal(parseKronerOre("1,25"),125);
assert.equal(oreToInput(12345),"123,45");
for(const raw of ["1e3","1.2.3","1,001","-10","",null])assert.throws(()=>parseKronerOre(raw));
assert.throws(()=>validateVatPurchaseInput({...original,documentConfirmed:false}),/dokumentasjon/i);
assert.throws(()=>validateVatPurchaseInput({...original,deductionConfirmed:false}),/dokumentasjon|fradragsrett/i);
assert.throws(()=>validateVatPurchaseInput({...original,evidenceReference:"?"}),/originalbilaget/);
assert.throws(()=>validateVatPurchaseInput({...original,documentDate:"2026-02-31"}),/gyldig dokumentdato/);
assert.throws(()=>validateVatPurchaseInput({...original,groups:{25:{base:"100,00",vat:"30,00"}}}),/må stemme/);
assert.throws(()=>validateVatPurchaseInput({...original,groups:{15:{base:"100,00",vat:"15,00"},23:{base:"5,00",vat:"2,00"}}}),/Ukjent/);
assert.throws(()=>validateVatPurchaseInput({...original,deductionPercent:101}),/andel/);
assert.throws(()=>validateVatPurchaseInput({...original,kind:"credit"}),/opprinnelig fakturanummer/);
const credit=validateVatPurchaseInput({...original,kind:"credit",originalDocumentNumber:"INV 789",
 documentNumber:"KN 789",groups:{25:{base:"200,00",vat:"50,00"}},deductionPercent:100});
assert.equal(credit.kind,"credit");
assert.equal(credit.deductible_vat_ore,5000);
const bank={...original,groups:{25:{base:"10000,00",vat:"2500,00"}}};
assert.throws(()=>validateVatPurchaseInput(bank),/10 000 kr/);
assert.equal(validateVatPurchaseInput({...bank,bankConditionConfirmed:true}).deductible_vat_ore,125000);
assert.equal(validateVatPurchaseInput({...bank,kind:"credit",documentNumber:"KN",originalDocumentNumber:"INV 789"}).kind,"credit");
const purchase={
 id:"p1",document_date:"2026-10-24",kind:"purchase",supplier_name:"Megaflis",
 supplier_document_number:"INV 789",evidence_reference:"Systemia bilag 46",
 ...parsed
};
const negative={
 id:"p2",document_date:"2026-10-24",kind:"credit",supplier_name:"Megaflis",
 supplier_document_number:"KN 789",evidence_reference:"Systemia bilag 47",
 ...credit
};
const summary=calculateInputVatSummary([purchase,negative],{year:2026,term:5});
assert.equal(summary.documentCount,2);
assert.equal(summary.inputVatOre,3100-5000);
assert.equal(summary.vatOnPurchasesOre,6200-5000);
assert.equal(summary.byRate[12].vatOre,1200);
assert.equal(summary.byRate[25].vatOre,5000-5000);
assert.equal(summary.rows[1].baseOre,-20000);
assert.equal(calculateInputVatSummary([{...purchase,voided_at:"2026-10-25T10:00:00Z"}],{year:2026,term:5}).inputVatOre,0);
assert.throws(()=>calculateInputVatSummary([{...purchase,document_date:"2026-08-01"}],{year:2026,term:5}),/termin/);
assert.throws(()=>calculateInputVatSummary([{...purchase,deductible_vat_ore:10000}],{year:2026,term:5}),/fradragsgrunnlag|MVA-linjene/);

const sales=term.buildInvoiceVatTermReport([{
 id:"invoice-1",status:"issued",issued_date:"2026-10-10",
 invoice_number:"AS-2026-1",customer:{name:"Customer"},
 line_items:[{quantity:1,unitPriceOre:10000,vatRate:25}]
}],[],{year:2026,term:5});
const combined=mergedVatReport(sales,summary);
assert.equal(combined.comparison.outputVatOre,2500);
assert.equal(combined.comparison.inputVatOre,-1900);
assert.equal(combined.comparison.differenceOre,4400);
assert.equal(combined.comparison.isComplete,false);
const csv=combinedVatCsv({...combined,comparison:{...combined.comparison,estimateAllowed:true}},term.invoiceVatTermCsv(combined));
assert.ok(csv.startsWith("\uFEFF"));
assert.match(csv,/Inngående MVA/);
assert.ok(csv.includes("Systemia bilag 46"));
assert.ok(csv.includes('"-50,00"'));
assert.ok(csv.includes('"44,00"'));
const dangerous=combinedVatCsv(mergedVatReport(sales,
 calculateInputVatSummary([{...purchase,supplier_name:"=HYPERLINK(\"bad\")"}],{year:2026,term:5})),term.invoiceVatTermCsv(sales));
assert.ok(dangerous.includes('"\'=HYPERLINK('));
const ui=readFileSync("app/admin/faktura/mva/InputVatRegisterClient.js","utf8");
const api=readFileSync("app/api/admin/invoices/vat-purchases/route.js","utf8");
const vatPage=readFileSync("app/admin/faktura/mva/InvoiceVatTermClient.js","utf8");
const settlementSrc=readFileSync("lib/vatSettlementPreview.js","utf8").replace(/^export /gm,"");
const {vatSettlementPreview}=new Function(settlementSrc+";return {vatSettlementPreview};")();
assert.deepEqual(vatSettlementPreview({outputVatOre:25000,inputVatOre:5000,differenceOre:20000,estimateAllowed:true}),{
 direction:"payable",label:"Foreløpig å betale til Skatteetaten",amountOre:20000});
assert.deepEqual(vatSettlementPreview({outputVatOre:5000,inputVatOre:25000,differenceOre:-20000,estimateAllowed:true}),{
 direction:"receivable",label:"Foreløpig MVA til gode",amountOre:20000});
assert.deepEqual(vatSettlementPreview({outputVatOre:1250,inputVatOre:1250,differenceOre:0,estimateAllowed:true}),{
 direction:"balanced",label:"Foreløpig MVA i balanse",amountOre:0});
assert.equal(vatSettlementPreview({outputVatOre:2500,inputVatOre:500,differenceOre:1200}),null,
 "Amounts must reconcile: inconsistent reports cannot show payment estimates");
assert.equal(vatSettlementPreview({outputVatOre:2500,inputVatOre:null,differenceOre:2500}),null);
assert.equal(vatSettlementPreview({outputVatOre:Infinity,inputVatOre:500,differenceOre:500}),null);
assert.equal(vatSettlementPreview({outputVatOre:25000,inputVatOre:5000,differenceOre:20000}),null);
assert.ok(vatPage.includes("vatSettlementPreview(report.comparison)"));
assert.ok(vatPage.includes("settlement.label"));
assert.ok(vatPage.includes("money(settlement.amountOre)"));
assert.ok(vatPage.includes("bare en foreløpig beregning"));
assert.ok(vatPage.includes("ikke et betalingskrav"));

const migration=readFileSync("supabase/migrations/20261024222000_vat_purchase_documents.sql","utf8");
assert.ok(vatPage.includes("<InputVatRegisterClient"));
assert.ok(vatPage.includes("Foreløpig differanse"));
assert.ok(ui.includes("Registrer kontrollert bilag"));
assert.ok(ui.includes("Opphev registrering"));
assert.ok(api.includes("sameOriginGuard(req)"));
assert.ok(api.includes('user?.role!=="owner"'));
assert.ok(api.includes("confirmed_by:user.id"));
assert.ok(migration.includes("enable row level security"));
assert.ok(migration.includes("create unique index"));
assert.ok(migration.includes("Et godkjent leverandørbilag kan ikke endres"));
console.log("Inngående MVA bestått: 4 satser, delvis fradrag, leverandørkreditnota, bankkrav, låsing, kontrollert MVA og Excel CSV.");
