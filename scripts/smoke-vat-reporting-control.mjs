import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const periodSrc=read("lib/vatDocumentPeriod.js").replace(/^export /gm,"");
const {vatDocumentPeriod}=new Function(periodSrc+";return {vatDocumentPeriod};")();
const model=read("lib/vatReportingControl.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {validateVatReportingProfile,validateVatReportingStatus,vatReportingAdvice,vatPeriodKey}=
 new Function("vatDocumentPeriod",model+
 ";return {validateVatReportingProfile,validateVatReportingStatus,vatReportingAdvice,vatPeriodKey};")(vatDocumentPeriod);
const reg=validateVatReportingProfile({registrationDate:"2026-06-04",confirmed:true});
assert.deepEqual(reg,{id:"primary",registration_date:"2026-06-04",first_term_year:2026,first_term:3});
assert.throws(()=>validateVatReportingProfile({registrationDate:"2026-06-04",confirmed:false}),/Bekreft/);
assert.throws(()=>validateVatReportingProfile({registrationDate:"2026-02-31",confirmed:true}),/gyldig/);
assert.throws(()=>validateVatReportingProfile({registrationDate:"2026-11-01",confirmed:true},"2026-10-26"),/fremtidig/);
assert.deepEqual(vatReportingAdvice(reg,2026,2).kind,"before_registration");
assert.equal(vatReportingAdvice(reg,2026,3).kind,"normal");
assert.equal(vatReportingAdvice(reg,2026,5).kind,"normal");
assert.equal(vatReportingAdvice(null,2026,3).kind,"unknown");
assert.equal(vatPeriodKey(2026,5),20265);
assert.equal(vatPeriodKey(2026,7),null);
const today="2026-10-26";
assert.deepEqual(validateVatReportingStatus({year:2026,term:3,status:"filed",filedOn:"2026-09-07",
 submissionReference:"Skatteetaten 123",verificationSource:"skatteetaten",notes:"",confirmed:true},today),
 {year:2026,term:3,status:"filed",filed_on:"2026-09-07",submission_reference:"Skatteetaten 123",verification_source:"skatteetaten",notes:null});
assert.equal(validateVatReportingStatus({year:2026,term:4,status:"not_filed",filedOn:"",confirmed:true},today).filed_on,null);
assert.equal(validateVatReportingStatus({year:2026,term:4,status:"preparing",confirmed:true},today).filed_on,null);
assert.equal(validateVatReportingStatus({year:2026,term:4,status:"unverified",confirmed:true},today).status,"unverified");
assert.throws(()=>validateVatReportingStatus({year:2026,term:3,status:"filed",filedOn:"2026-09-07",
 submissionReference:"Skatteetaten 123",confirmed:true},today),/kontrollert/i);
assert.throws(()=>validateVatReportingStatus({year:2026,term:3,status:"filed",filedOn:"2026-09-07",
 verificationSource:"tripletex",submissionReference:"",confirmed:true},today),/referanse/i);
assert.equal(validateVatReportingStatus({year:2026,term:3,status:"filed",filedOn:"2026-09-07",
 verificationSource:"tripletex",submissionReference:"Tripletex 55555",confirmed:true},today).verification_source,"tripletex");
assert.throws(()=>validateVatReportingStatus({year:2026,term:4,status:"filed",filedOn:"",confirmed:true},today),/innsendingsdato/);
assert.throws(()=>validateVatReportingStatus({year:2026,term:4,status:"filed",filedOn:"2026-11-01",confirmed:true},today),/innsendingsdato/);
assert.throws(()=>validateVatReportingStatus({year:2026,term:4,status:"filed",filedOn:"2026-10-01",confirmed:false},today),/bekrefte/i);
assert.throws(()=>validateVatReportingStatus({year:2026,term:4,status:"unknown",confirmed:true},today),/status/);
const source=read("lib/invoiceVatTermReport.js").replace(/^export /gm,"");
const {buildInvoiceVatTermReport}=new Function(source+";return {buildInvoiceVatTermReport};")();
const inv=(id,paid_ore,credited_ore)=>({
 id,status:"issued",invoice_number:"AS-"+id,issued_date:"2026-10-11",customer:{name:"Kunde"},
 line_items:[{quantity:1,unitPriceOre:10000,vatRate:25}],paid_ore,credited_ore
});
const vat=buildInvoiceVatTermReport([
 inv("1",0,0),inv("2",5000,0),inv("3",12500,0),inv("4",0,12500),
 {id:"legacy",status:"issued",invoice_number:"AS-legacy",issued_date:"2026-10-10",
 customer:{name:"Kunde"},line_items:[{quantity:1,unitPriceOre:10000,vatRate:25}]}
],[],{year:2026,term:5});
assert.equal(vat.total.vatOre,12500,"Every issued invoice counts toward VAT regardless of payment");
assert.deepEqual(vat.total.paymentSnapshot,{openCount:2,openGrossOre:20000,settledCount:2,unknownCount:1});
assert.equal(vat.rows[0].paymentStatus,"unknown");
assert.throws(()=>buildInvoiceVatTermReport([inv("bad",14000,0)],[],{year:2026,term:5}),/saldo/);
assert.throws(()=>buildInvoiceVatTermReport([inv("bad2",-1,0)],[],{year:2026,term:5}),/saldo/);
const route=read("app/api/admin/invoices/vat-reporting-control/route.js");
assert.ok(route.includes('user?.role!=="owner"'));
assert.ok(route.includes("sameOriginGuard(req)"));
assert.ok(route.includes('process.env.VERCEL_ENV==="preview"'));
assert.ok(route.includes('verifiedWithSkatteetaten:false'));
assert.ok(route.includes('vat_reporting_term_events'));
assert.ok(route.includes('verification_source'));
const reportingUI=read("app/admin/faktura/mva/VatReportingControlClient.js");
assert.ok(reportingUI.includes("Lagre registreringsdato"));
assert.ok(reportingUI.includes("Skatteetaten er ikke kontaktet."));
assert.ok(reportingUI.includes('onSelectTerm?.(t)'));
assert.ok(reportingUI.includes("Referanse fra leveringskvitteringen (påkrevd)"));
assert.ok(reportingUI.includes("Se historikk for"));
assert.ok(reportingUI.includes("Ikke kontrollert / tilbakestill usikker status"));
const termUI=read("app/admin/faktura/mva/InvoiceVatTermClient.js");
assert.ok(termUI.includes("<VatReportingControlClient"));
assert.ok(termUI.includes("Ubetalte fakturaer påvirker ikke når MVA skal meldes"));
assert.ok(termUI.includes("Utestående nå"));
const taxApi=read("app/api/admin/invoices/vat-terms/route.js");
assert.ok(taxApi.includes("paid_ore,credited_ore"));
const migration=read("supabase/migrations/20261026010000_vat_reporting_control.sql");
assert.ok(migration.includes("enable row level security")&&migration.includes("revoke all"));
assert.ok(migration.includes("before delete")&&migration.includes("service_role"));
const auditMigration=read("supabase/migrations/20261121041000_vat_reporting_term_evidence.sql");
for(const clause of ["vat_reporting_term_events","log_vat_reporting_term_change","enable row level security",
 "vat_term_filed_evidence_check","vat_reporting_term_status_status_check",
 "revoke all on public.vat_reporting_term_events from public,anon,authenticated"])
 assert.ok(auditMigration.includes(clause),"Missing status evidence safeguard "+clause);
console.log("MVA-oppfølging bestått: første termin, manuell leveringsstatus, ubetalte fakturaer og RLS-sperrer.");
