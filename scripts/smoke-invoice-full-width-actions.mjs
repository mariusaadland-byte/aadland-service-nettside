import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const invoice=read("app/admin/faktura/InvoicesClient.js");
const actions=read("app/admin/faktura/InvoiceQuickActions.js");
const css=read("app/admin/faktura/InvoiceWorkspace.module.css");
const panels=[
 ["invoice-payment-actions",invoice],
 ["invoice-vipps-payment",read("app/admin/faktura/InvoiceVippsPanel.js")],
 ["invoice-friendly-reminder",read("app/admin/faktura/InvoiceFriendlyReminderPanel.js")],
 ["invoice-reminder-actions",read("app/admin/faktura/InvoiceReminderPanel.js")],
 ["invoice-credit-note",read("app/admin/faktura/InvoiceCreditNotePanel.js")],
 ["invoice-payment-statement",read("app/admin/faktura/InvoicePaymentStatementPanel.js")],
 ["invoice-settlement",read("app/admin/faktura/InvoiceSettlementPanel.js")],
 ["invoice-activity-timeline",read("app/admin/faktura/InvoiceActivityTimeline.js")],
 ["invoice-administrative-close",read("app/admin/faktura/InvoiceClosurePanel.js")]
];
for(const [anchor,content] of panels){
 assert.ok(content.includes('id="'+anchor+'"'),
  "One-click action must point to a real visible panel: "+anchor);
}
const primary=actions.matchAll(/target:"([^"]+)"/g);
for(const match of primary)assert.ok(panels.some(([id])=>id===match[1]),
 "Quick action has no matching panel "+match[1]);
assert.ok(actions.includes("Faktura {invoice.invoice_number"),"Selected invoice number shown first");
assert.ok(actions.includes("Hva vil du gjøre med fakturaen?"));
assert.ok(actions.includes('Registrer bank- eller kontantbetaling'));
assert.ok(actions.includes("Vennlig betalingspåminnelse"));
assert.ok(actions.includes("Purring eller inkassovarsel"));
assert.ok(actions.includes("Opprett / se kreditnota"));
assert.ok(actions.includes("Vipps og betalingsvalg"));
assert.ok(actions.includes("Åpne faktura (PDF)"));
assert.ok(actions.includes("Skriv ut faktura"));
assert.ok(actions.includes("Velg en annen faktura"));
assert.ok(actions.includes('href={"/api/admin/invoices/pdf?id="+encodeURIComponent(invoice.id)}'));
assert.ok(actions.includes("invoice.split_group_id"),"Do not offer Vipps for split invoices");
assert.ok(actions.includes("pending?[{label:"),"Unpaid-only actions should not advertise reminder on paid invoices");
assert.ok(!actions.includes('fetch('),"Action shortcuts should never book or send silently");
assert.ok(!actions.includes('window.confirm('),"No action bypasses its existing confirmation");
assert.ok(invoice.includes('className={archiveMode?(form?workspaceStyles.archiveWorkspace'));
assert.ok(invoice.includes('workspaceStyles.archiveNoSelection'));
assert.ok(invoice.includes('className={"card"+(archiveMode?" "+workspaceStyles.archiveList:"")}'));
assert.ok(invoice.includes('id="invoice-archive-list"'));
assert.ok(invoice.includes('id="invoice-main-actions"'));
assert.ok(invoice.includes('aria-expanded={invoiceListOpen}'));
assert.ok(invoice.includes('(!archiveMode||invoiceListOpen)'));
assert.ok(invoice.includes('if(archiveMode){setInvoiceListOpen(false);setSelectedInvoiceAction(null);}'),
 "New invoice selection must close the previous action and invoice list");
assert.ok(invoice.includes('if(!archiveMode||!form?.id)return;'));
assert.ok(invoice.includes('invoice-main-actions")'));
assert.ok(invoice.includes('archiveMode&&<InvoiceQuickActions'));
assert.ok(invoice.includes('{(!archiveMode||!form.sent_at)&&<>'),
 "Do not show inactive huge send and print buttons on already-sent invoices");
assert.ok(invoice.includes('onClick={()=>registerPayment(false)}'));
assert.ok(invoice.includes('onClick={sendInvoice}'));
assert.ok(invoice.includes('onClick={()=>sendManualReceipt(p)}'));
assert.ok(invoice.includes('<InvoiceReminderPanel'));
assert.ok(invoice.includes('<InvoiceCreditNotePanel'));
assert.ok(invoice.includes('<InvoiceVippsPanel'));
assert.ok(css.includes(".archiveWorkspace{display:flex;flex-direction:column"));
assert.ok(css.includes(".archiveDetail{order:0;width:100%"));
assert.ok(css.includes(".archiveList{order:1;width:100%"));
assert.ok(css.includes(".archiveNoSelection .archiveList{order:0"));
assert.ok(css.includes(".draftWorkspace{display:grid"),"Preserve draft layout");
assert.ok(css.includes("grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))"),
 "Buttons must auto-size and not squash into letter-width columns");
assert.ok(css.includes("word-break:normal"),"Text cannot break letter by letter");
const globalCss=read("app/globals.css");
assert.ok(globalCss.includes(".admin{display:grid;grid-template-columns:248px 1fr;"),
 "Regression relies on detecting the global two-column admin shell");
assert.ok(invoice.includes('className="admin" style={{display:"block",width:"100%",minWidth:0,'),
 "The standalone invoice page must explicitly override the global 248px admin grid");
assert.ok(css.includes(".archiveWorkspace{display:flex;flex-direction:column;gap:20px;align-items:stretch;width:100%"),
 "Invoice archive must span its page");
assert.ok(css.includes(".archiveDetail{order:0;width:100%;min-width:0;max-width:100%"),
 "Selected invoice card must occupy entire available page width");
assert.ok(css.includes("@media(max-width:510px)"));
const archivePage=read("app/admin/faktura/arkiv/page.js");
assert.ok(archivePage.includes("archiveMode"));
console.log("Fullbredde fakturahandlinger bestått: arkiv én kolonne med stor faktura, alle 9 handlingsmål er gyldige, listen kan åpnes/lukkes, betaling/sending-kontroller beholdt og mobil-layout finnes. Ingen fakturaer endret.");
