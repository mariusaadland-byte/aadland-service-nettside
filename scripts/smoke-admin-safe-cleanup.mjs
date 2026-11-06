import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const quoteApi=read("app/api/admin/quotes/route.js");
const quoteUi=read("app/admin/tilbud/QuotesClient.js");
const invoiceApi=read("app/api/admin/invoices/route.js");
const invoiceUi=read("app/admin/faktura/InvoicesClient.js");
const rentalApi=read("app/api/admin/rental-bookings/route.js");
const rentalUi=read("app/admin/AdminClient.js");
const ordersApi=read("app/api/admin/orders/route.js");
const migration=read("supabase/migrations/20261106033000_admin_safe_cleanup.sql");

// Only genuinely unused test drafts can be deleted permanently.
assert.match(quoteApi,/export async function DELETE\(req\)/);
assert.match(quoteApi,/user\?\.role!=="owner"/);
assert.match(quoteApi,/q\.status!=="draft"/);
for(const name of ["invoice_drafts","quote_send_log","quote_drawing_publications"]){
 assert.ok(quoteApi.includes(name),name+" must block accidental deletion");
}
assert.match(quoteApi,/body\.confirm!=="SLETT"/);
assert.match(quoteUi,/Slett ubrukt testkladd/);
assert.match(invoiceApi,/export async function DELETE\(req\)/);
assert.match(invoiceApi,/row\.status!=="draft"/);
assert.match(invoiceApi,/row\.invoice_number/);
assert.match(invoiceApi,/invoice_vipps_payments/);
assert.match(invoiceApi,/invoice_payments/);
assert.match(invoiceApi,/confirmation!=="SLETT KLADD"/);
assert.match(invoiceUi,/Slett ubrukt testkladd/);

// Every external payment remains recorded, even when a test is hidden.
assert.match(ordersApi,/action==="hide-test-order"/);
assert.match(ordersApi,/cleanupConfirmation!=="SKJUL TEST"/);
assert.match(ordersApi,/archive_reason:"test"/);
assert.ok(!ordersApi.match(/hide-test-order[\s\S]{0,1300}\.delete\(/),"Test hiding cannot delete a payment");
assert.match(rentalApi,/action==="archive-cleanup"/);
assert.match(rentalApi,/action==="restore-cleanup"/);
assert.match(rentalApi,/captured>refunded/);
assert.match(rentalApi,/current\.status==="new"\)patch\.status="cancelled"/);
assert.match(rentalApi,/confirmation_sent_at/);
assert.match(rentalUi,/Arkiv \/ fjernede bookinger/);
assert.match(rentalUi,/Fjern test fra oversikten/);
assert.match(rentalUi,/Slett ubrukt testkladd/);
assert.match(migration,/alter table public\.rental_bookings add column if not exists archived_at/);
assert.match(migration,/alter table public\.orders add column if not exists archive_reason/);
assert.doesNotMatch(migration,/drop table|delete from|truncate\s+/i);
console.log("Sikker opprydding bestått: testkladder, utleiearkiv, testordrer, originale betalinger og gjenoppretting.");
