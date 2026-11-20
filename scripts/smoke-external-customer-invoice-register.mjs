import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=file=>readFileSync(file,"utf8");
const source=read("lib/externalInvoiceRegister.js").replace(/^export /gm,"");
const {externalInvoiceInput,parseExternalInvoiceOre,externalInvoicePaidInput,
 externalInvoiceDate}=new Function(source+
 ";return {externalInvoiceInput,parseExternalInvoiceOre,externalInvoicePaidInput,externalInvoiceDate};")();
assert.equal(parseExternalInvoiceOre("1 250,50"),125050);
assert.equal(parseExternalInvoiceOre("1.20"),120);
assert.equal(parseExternalInvoiceOre("0"),null);
assert.equal(parseExternalInvoiceOre("1.234"),null);
assert.equal(parseExternalInvoiceOre("1e4"),null);
assert.equal(externalInvoiceDate("2026-02-30"),false);
const form={sourceSystem:"Conta",invoiceNumber:"CT-520",customerName:"Testkunde",
 issuedOn:"2026-11-01",dueOn:"2026-11-19",amount:"1250,50",
 note:"Arkivkopi",notDuplicateConfirmed:"true"};
const valid=externalInvoiceInput(form);
assert.equal(valid.amount_ore,125050);
assert.equal(valid.source_system,"Conta");
assert.equal(valid.due_on,"2026-11-19");
assert.throws(()=>externalInvoiceInput({...form,notDuplicateConfirmed:false}),/Bekreft/);
assert.throws(()=>externalInvoiceInput({...form,dueOn:"2026-10-30"}),/Kontroller/);
assert.throws(()=>externalInvoiceInput({...form,amount:"-10"}),/Kontroller/);
assert.throws(()=>externalInvoiceInput({...form,customerName:""}),/Kontroller/);
assert.throws(()=>externalInvoiceInput({...form,issuedOn:"2026-02-30"}),/Kontroller/);
assert.deepEqual(externalInvoicePaidInput({
 action:"mark-paid",paidOn:"2026-11-19",paymentNote:"Bankoverføring",confirmed:true
},"2026-11-20"),{paid_on:"2026-11-19",payment_note:"Bankoverføring"});
assert.throws(()=>externalInvoicePaidInput({
 action:"mark-paid",paidOn:"2026-11-21",paymentNote:"",confirmed:true
},"2026-11-20"),/bekreft|Bekreft/);
assert.throws(()=>externalInvoicePaidInput({
 action:"mark-paid",paidOn:"2026-11-20",paymentNote:"",confirmed:false
},"2026-11-20"),/Bekreft/);
const route=read("app/api/admin/invoices/external-register/route.js");
assert.ok(route.includes('owner?.role!=="owner"'));
assert.ok(route.includes('user?.role!=="owner"'));
assert.ok(route.includes("sameOriginGuard(req)"));
assert.ok(route.includes('process.env.VERCEL_ENV==="preview"'));
assert.ok(route.includes("inspectVatAttachment"));
assert.ok(route.includes('upsert:false'));
assert.ok(route.includes("vatAttachmentBucket"));
assert.ok(route.includes("crypto.createHash"));
assert.ok(route.includes(".eq(\"status\",\"unpaid\")"));
assert.ok(route.includes('status:"paid"'));
assert.ok(route.includes("externalInvoicePaidInput"));
assert.ok(!route.includes("tripletexCreateVippsSettlementVoucher"));
assert.ok(!route.includes("invoice_payments").replaceAll(" ",""));
assert.ok(!route.includes("invoice_credit_notes"));
const page=read("app/admin/faktura/eksterne/page.js");
assert.ok(page.includes('admin.role!=="owner"'));
const ui=read("app/admin/faktura/eksterne/ExternalInvoiceRegisterClient.js");
assert.ok(ui.includes("Merk som betalt"));
assert.ok(ui.includes("Bekreft at fakturaen er betalt"));
assert.ok(ui.includes('method:"PATCH"'));
assert.ok(ui.includes("Betalte ("));
assert.ok(ui.includes("Ubetalte ("));
assert.ok(ui.includes('type="file"'));
assert.ok(ui.includes("MVA-registrering"));
const archive=read("app/admin/faktura/InvoicesClient.js");
assert.ok(archive.includes('href="/admin/faktura/eksterne"'));
const migration=read("supabase/migrations/20261120124500_external_customer_invoice_register.sql");
assert.ok(migration.includes("enable row level security"));
assert.ok(migration.includes("unique"));
assert.ok(migration.includes("grant select,insert,update"));
assert.ok(!migration.toLowerCase().includes("grant all to anon"));
console.log("Eksterne fakturaer: validering av kundefaktura, privat original, eiersperre, sikker betaltmerking, dublettbeskyttelse og eget register bestått.");
