import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const form=read("app/admin/faktura/InvoicesClient.js");
const panel=read("app/admin/faktura/InvoiceVippsPanel.js");
const api=read("app/api/admin/invoices/route.js");
const pdf=read("lib/invoiceDraftPdf.js");
const css=read("app/admin/faktura/InvoiceWorkspace.module.css");
assert.ok(form.includes('aria-label="Velg betalingsmåte for faktura"'));
assert.ok(form.includes('id="invoice-payment-method"'));
for(const name of ['<option value="bank">','<option value="vipps">','<option value="cash">'])
 assert.ok(form.includes(name),"Missing one payment method "+name);
assert.ok(form.includes('onChange={e=>choosePaymentMethod(e.target.value)}'));
assert.ok(form.includes('function choosePaymentMethod(method){'));
assert.ok(form.includes('workDate:method==="vipps"?today:form.customer?.workDate||""'));
assert.ok(form.includes('form.status==="draft"&&!form.split_group_id&&form.customer?.paymentMethod==="vipps"'));
assert.ok(form.includes('<details className={workspaceStyles.vippsDraftDisclosure}>'));
assert.ok(form.indexOf('className={workspaceStyles.vippsDraftDisclosure}')>form.indexOf('Rediger fakturakladd'),
 "Advanced Vipps controls must be after the editor");
assert.ok(form.includes('archiveMode&&!form.split_group_id&&selectedInvoiceAction==="invoice-vipps-payment"'),
 "Archive uses its original focused action");
assert.ok(!form.includes('!form.split_group_id&&(!archiveMode||selectedInvoiceAction==="invoice-vipps-payment")'),
 "Vipps should not open ahead of draft editor");
assert.ok(!panel.includes('Betalingsmåte ved prisberegningen'),
 "No second payment method selector in Vipps panel");
assert.ok(form.includes('Fakturer og send på e-post')&&form.includes('Fakturer og skriv ut'));
assert.ok(form.includes('archiveMode&&!form.sent_at&&<>'),
 "Do not render duplicate draft invoice-issue buttons above editor");
assert.ok(!form.includes("Vipps – åpne betalingsvalg"));
assert.ok(api.includes('["bank","vipps","cash"].includes(body.customer?.paymentMethod)'),
 "Cash is persisted, not silently mapped to bank");
assert.ok(pdf.includes('const payWithCash='));
assert.ok(pdf.includes('Betalingsmåte: Kontant'));
assert.ok(pdf.includes('Fakturaen er ikke betalt'));
assert.ok(form.includes('invoice.customer?.paymentMethod==="cash"'),
 "Draft preview uses its actual selected payment type");
assert.ok(css.includes('.singlePaymentChoice')&&css.includes('.vippsDraftDisclosure'));
assert.ok(panel.includes('window.confirm(details)')&&panel.includes('confirmedInvoice:invoiceVippsConfirmationSnapshot(invoice)'),
 "Existing safe Vipps confirmations remain intact");
assert.ok(form.includes('onClick={()=>registerPayment(false)}'),
 "Bank and cash still require confirmed received payment before posting");
console.log("Faktura: ett bank/Vipps/kontant-valg, avansert Vipps skjult under skjemaet, korrekt PDF og uendrede sikkerhetsbekreftelser.");
