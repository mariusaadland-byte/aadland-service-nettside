import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=x=>readFileSync(x,"utf8");
const source=read("lib/externalInvoiceRegister.js").replace(/^export /gm,"");
const {parseExternalInvoiceOre}=new Function(source+";return {parseExternalInvoiceOre};")();
const importSource=read("lib/externalInvoiceTripletex.js")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {validateExternalImport,externalTripletexCsv,externalImportHeaders}=new Function(
 "parseExternalInvoiceOre",importSource+
 ";return {validateExternalImport,externalTripletexCsv,externalImportHeaders};"
)(parseExternalInvoiceOre);
const invoice={id:"12345678-1234-4234-a234-123456789012",
 source_system:"Conta",invoice_number:"CNT-005",
 customer_name:"Test Person",issued_on:"2026-10-23",
 due_on:"2026-11-06",amount_ore:125000,
 sha256:"a".repeat(64),status:"unpaid"};
const form={vatRate:25,baseAmount:"1000,00",importNumber:"80000020",
 vatConfirmed:true,notImportedConfirmed:true,correctCustomerConfirmed:true};
const plan=validateExternalImport(invoice,form);
assert.equal(plan.base_ore,100000);
assert.equal(plan.vat_ore,25000);
assert.equal(plan.import_number,80000020);
assert.equal(plan.snapshot_paid,false);
assert.throws(()=>validateExternalImport(invoice,{...form,baseAmount:"900"}),/MVA-sats/);
assert.throws(()=>validateExternalImport(invoice,{...form,vatRate:0}),/MVA-sats/);
assert.throws(()=>validateExternalImport(invoice,{...form,vatConfirmed:false}),/Bekreft/);
assert.throws(()=>validateExternalImport(invoice,{...form,importNumber:"12"}),/MVA-sats/);
const paidPlan=validateExternalImport({...invoice,status:"paid"},form);
assert.throws(()=>validateExternalImport({...invoice,status:"paid"},
 {...form,paymentTypeImportId:"BANK"}),/Betalingstype/);
assert.equal(paidPlan.payment_type_import_id,null);
assert.equal(paidPlan.snapshot_paid,true);
const customer={tripletex_customer_id:723,tripletex_customer_number:45678,
 snapshot_customer_name:"Test Person"};
const csv=externalTripletexCsv(invoice,{...plan,...customer,status:"prepared"});
assert.match(csv,/80000020/);
assert.match(csv,/CNT-005/);
assert.match(csv,/1000,00/);
assert.match(csv,/"3"/);
assert.equal(csv.split("\r\n").filter(Boolean).length,2);
assert.equal(externalImportHeaders.length,16);
assert.ok(externalImportHeaders.includes("CUSTOMER NO"));
assert.ok(csv.includes('"45678"'));
assert.throws(()=>externalTripletexCsv(invoice,{...plan,status:"prepared"}),/endret/);
assert.throws(()=>externalTripletexCsv(invoice,{...plan,...customer,status:"confirmed"}),/endret/);
assert.throws(()=>externalTripletexCsv({...invoice,status:"paid"},
 {...plan,...customer,status:"prepared"}),/endret/);
assert.throws(()=>externalTripletexCsv(invoice,{
 ...plan,...customer,status:"prepared",snapshot_sha256:"b".repeat(64)
}),/endret/);
const paidCsv=externalTripletexCsv({...invoice,status:"paid"},
 {...paidPlan,...customer,status:"prepared"});
assert.ok(!paidCsv.includes('"1250,00"'),"Do not auto-book paid amount");
assert.ok(!paidCsv.includes('"BANK"'),"Never invent bank payment type");
const paidCells=paidCsv.trim().split("\r\n")[1].split(";");
assert.equal(paidCells.length,16);
assert.equal(paidCells[14],'""');
assert.equal(paidCells[15],'""');
const route=read("app/api/admin/invoices/external-register/tripletex/route.js");
assert.ok(route.includes('user?.role!=="owner"'));
assert.ok(route.includes("sameOriginGuard(req)"));
assert.ok(route.includes('process.env.VERCEL_ENV!=="production"'));
assert.ok(route.includes('"prepare","verify-import"'));
assert.ok(route.includes("tripletexRead"));
assert.ok(!route.includes("tripletexCreateUnsentedInvoice"));
assert.ok(!route.includes("tripletexRecordInvoicePayment"));
assert.ok(route.includes('status:"confirmed"'));
assert.ok(route.includes('status:"prepared"'));
assert.ok(route.includes("verifiedCustomer(s,invoice,session,connection.environment)"));
assert.ok(route.includes("checkedRemoteList(session,connection.environment,invoice.issued_on)"));
assert.ok(route.includes("snapshot_contact_id:customer.contactId"));
assert.ok(route.includes("tripletex_customer_number:customer.tripletexCustomerNumber"));
assert.ok(route.includes("Number(found[0]?.customer?.id)!==Number(claim.tripletex_customer_id)"));
assert.ok(route.includes('customerStatus="linked_to_tripletex"')===false);
const native=read("app/admin/faktura/InvoicesClient.js");
assert.ok(native.includes("<CombinedInvoiceOverview nativeInvoices={items}/>"));
const combined=read("app/admin/faktura/CombinedInvoiceOverview.js");
assert.ok(combined.includes("invoicePaymentState"));
assert.ok(combined.includes("external-register?offset="));
assert.ok(combined.includes("Samlet fakturaoversikt"));
assert.ok(combined.includes("tripletex_import?.status"));
const external=read("app/admin/faktura/eksterne/ExternalInvoiceRegisterClient.js");
assert.ok(external.includes("<ExternalInvoiceTripletexPanel"));
assert.ok(external.includes("Overfør til Tripletex"));
const panel=read("app/admin/faktura/eksterne/ExternalInvoiceTripletexPanel.js");
assert.ok(panel.includes('customerStatus!=="linked_to_tripletex"'));
assert.ok(panel.includes("Oppdater kundekobling"));
assert.ok(panel.includes("UBETALT i Tripletex"));
assert.ok(!panel.includes("paymentTypeImportId:paid?"));
const migration=read("supabase/migrations/20261120134000_external_invoice_tripletex_import.sql");
assert.ok(migration.includes("enable row level security"));
assert.ok(migration.includes("unique"));
const customerMigration=read("supabase/migrations/20261120162000_external_invoice_import_verified_customer.sql");
assert.ok(customerMigration.includes("xit_verified_customer"));
console.log("Samlet fakturaarkiv og ekstern Tripletex-import: original/fakturanr, ensats-MVA, betalt/ubetalt, dublett, bekreftelse, korrekt CSV og read-only API-kontroll bestått.");
