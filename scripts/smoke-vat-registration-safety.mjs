import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=path=>readFileSync(path,"utf8");
const dateCode=src("lib/vatDocumentPeriod.js").replace(/^export /gm,"");
const {vatDocumentPeriod}=new Function(dateCode+";return {vatDocumentPeriod};")();
const registrationCode=src("lib/vatReportingControl.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {vatPeriodKey}=new Function("vatDocumentPeriod",registrationCode+
 ";return {vatPeriodKey};")(vatDocumentPeriod);
const guardCode=src("lib/vatRegistrationGuard.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {applyVatRegistrationGuard}=new Function("vatPeriodKey",guardCode+
 ";return {applyVatRegistrationGuard};")(vatPeriodKey);
const retroCode=src("lib/vatRetroCandidates.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {retroCandidateCutoff,summarizeRetroCandidates}=new Function("vatPeriodKey","vatDocumentPeriod",retroCode+
 ";return {retroCandidateCutoff,summarizeRetroCandidates};")(vatPeriodKey,vatDocumentPeriod);
const profile={registration_date:"2026-06-15",first_term_year:2026,first_term:3};
const period=(term,from,to)=>({year:2026,term,from,to});
const report=term=>({period:period(term,"2026-05-01","2026-06-30"),
 comparison:{outputVatOre:30000,inputVatOre:15000,differenceOre:15000,isComplete:false,
 warning:"Forenklet regnskap"}});
const missing=applyVatRegistrationGuard(report(3),null);
assert.equal(missing.comparison.estimateAllowed,false);
assert.equal(missing.registrationReview.kind,"registration_unknown");
const old=applyVatRegistrationGuard(report(2),profile);
assert.equal(old.comparison.estimateAllowed,false);
assert.equal(old.registrationReview.kind,"before_registration");
assert.equal(old.comparison.differenceOre,15000,"Do not change historical bookkeeping amounts");
const first=applyVatRegistrationGuard(report(3),profile);
assert.equal(first.comparison.estimateAllowed,true);
assert.equal(first.registrationReview.kind,"first_term");
const later=applyVatRegistrationGuard(report(4),profile);
assert.equal(later.comparison.estimateAllowed,true);
assert.equal(later.registrationReview.kind,"later_term");
assert.throws(()=>applyVatRegistrationGuard(report(4),{registration_date:"2026-06-15",first_term_year:2026,first_term:9}),/registreringsdato/);
const settlement=src("lib/vatSettlementPreview.js").replace(/^export /gm,"");
const {vatSettlementPreview}=new Function(settlement+";return {vatSettlementPreview};")();
assert.equal(vatSettlementPreview(missing.comparison),null);
assert.equal(vatSettlementPreview(old.comparison),null);
assert.equal(vatSettlementPreview(first.comparison).amountOre,15000);
assert.equal(vatSettlementPreview({outputVatOre:30000,inputVatOre:15000,differenceOre:15000}),null);
assert.equal(retroCandidateCutoff("2026-06-15"),"2023-06-15");
const p={year:2026,term:3,from:"2026-05-01",to:"2026-06-30"};
const docs=[
 {id:"a",document_date:"2026-04-18",supplier_name:"Megaflis",supplier_document_number:"100",
  kind:"purchase",deductible_vat_ore:5000,evidence_reference:"Systemia #2"},
 {id:"b",document_date:"2026-04-20",supplier_name:"Megaflis",supplier_document_number:"KN100",
  kind:"credit",deductible_vat_ore:1000,evidence_reference:"Systemia #3"}
];
const result=summarizeRetroCandidates(profile,p,docs);
assert.equal(result.firstTerm,true);
assert.equal(result.count,2);
assert.equal(result.netPotentialOre,4000);
assert.equal(result.rows[0].period,"2. termin 2026");
assert.equal(summarizeRetroCandidates(profile,{...p,term:4},[]).firstTerm,false);
assert.throws(()=>summarizeRetroCandidates(profile,p,[{...docs[0],document_date:"2026-05-01"}]),/ugyldig registreringsperiode/);
assert.throws(()=>summarizeRetroCandidates(profile,p,[{...docs[0],document_date:"2023-06-14"}]),/ugyldig registreringsperiode/);
const ui=src("app/admin/faktura/mva/InvoiceVatTermClient.js");
const api=src("app/api/admin/invoices/vat-terms/route.js");
const retroApi=src("app/api/admin/invoices/vat-retro-candidates/route.js");
const retroUi=src("app/admin/faktura/mva/VatRetroCandidatesClient.js");
const csv=src("lib/invoiceInputVat.js");
assert.ok(ui.includes("VatRetroCandidatesClient"));
assert.ok(ui.includes("Beløp å betale / til gode vises ikke"));
assert.ok(api.includes("applyVatRegistrationGuard"));
assert.ok(api.includes('s.from("vat_reporting_profile")'));
assert.ok(retroApi.includes('user?.role!=="owner"')&&retroApi.includes(".lt(\"document_date\",period.from)"));
assert.ok(retroApi.includes("throw Error(\"For mange eldre bilag."));
assert.ok(retroUi.includes("ikke automatisk lagt til")||retroUi.includes("ikke automatisk"));
assert.ok(csv.includes("IKKE BEREGNET"));
console.log("MVA-registreringssperre og tilbakegående kandidater bestått: ukjent/første/eldre termin, kreditnota, treårsgrense og ingen automatisk fradragsføring.");
