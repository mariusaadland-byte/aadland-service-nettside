import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const client=read("app/admin/faktura/InvoicesClient.js");
const chooser=read("app/admin/faktura/InvoiceQuickActions.js");
const css=read("app/admin/faktura/InvoiceWorkspace.module.css");

assert.ok(client.includes("useState(null)")&&client.includes("selectedInvoiceAction,setSelectedInvoiceAction"),
 "No invoice action may be open initially");
assert.ok(client.includes("setSelectedInvoiceAction(null)},[archiveMode,active]"),
 "Switching invoice must reset the open action");
assert.ok(client.includes("selectedAction={selectedInvoiceAction} onSelectAction={setSelectedInvoiceAction}"),
 "Action picker must control selected archive panel");
assert.ok(client.includes('id="invoice-selected-action"'),
 "One focused action workspace should appear only on choice");
assert.ok(client.includes("archiveMode&&selectedInvoiceAction&&<div"),
 "No workspace can appear before choosing an action");
assert.ok(client.includes("Lukk handling ×"));
assert.ok(client.includes("setSelectedInvoiceAction(null);")&&client.includes("setInvoiceListOpen(true)"),
 "Switching selected invoice must close previous action");
assert.ok(chooser.includes("onSelectAction(selectedAction===target?null:target)"),
 "Clicking a second time closes the selected action");
assert.ok(chooser.includes('aria-pressed={selectedAction===target}'),
 "Action choices expose their selected state");
assert.ok(!chooser.includes("goto(")&&!chooser.includes("scrollIntoView"),
 "Action buttons must no longer scroll down an endless list");

const gates=[
 ['details','(!archiveMode||selectedInvoiceAction==="invoice-details")&&<section'],
 ['follow-up','archiveMode&&selectedInvoiceAction==="invoice-followup-status"&&<InvoiceFollowUpPanel'],
 ['closure','archiveMode&&selectedInvoiceAction==="invoice-administrative-close"&&<InvoiceClosurePanel'],
 ['settlement','archiveMode&&selectedInvoiceAction==="invoice-settlement"&&<InvoiceSettlementPanel'],
 ['timeline','archiveMode&&selectedInvoiceAction==="invoice-activity-timeline"&&<InvoiceActivityTimeline'],
 ['statement','archiveMode&&selectedInvoiceAction==="invoice-payment-statement"&&<InvoicePaymentStatementPanel'],
 ['Vipps','archiveMode&&!form.split_group_id&&selectedInvoiceAction==="invoice-vipps-payment"&&<InvoiceVippsPanel'],
 ['payments','archiveMode&&selectedInvoiceAction==="invoice-payment-actions"&&paymentInfo&&<section'],
 ['credit notes','archiveMode&&selectedInvoiceAction==="invoice-credit-note"&&<InvoiceCreditNotePanel'],
 ['friendly reminder','archiveMode&&selectedInvoiceAction==="invoice-friendly-reminder"&&<InvoiceFriendlyReminderPanel'],
 ['reminders','archiveMode&&selectedInvoiceAction==="invoice-reminder-actions"&&<InvoiceReminderPanel'],
 ['preview','(!archiveMode||selectedInvoiceAction==="invoice-details")&&<section id="invoice-draft-preview"']
];
for(const [name,token] of gates){
 assert.ok(client.includes(token),"Archived invoice must only render selected "+name);
}
assert.ok(client.includes("<details className={workspaceStyles.overviewDisclosure}>")&&
 client.includes("Vis samlet oppfølgings- og betalingsoversikt"),
 "The tall overview must be collapsed by default");
assert.ok(!client.includes("<details open className={workspaceStyles.overviewDisclosure}"),
 "Archive overview must start closed");
assert.ok(client.includes('archiveMode&&saved&&<p role="status"'),
 "Payment and action success messages must remain visible even when details panel is closed");

for(const action of [
 "invoice-payment-actions","invoice-vipps-payment","invoice-friendly-reminder",
 "invoice-reminder-actions","invoice-credit-note","invoice-payment-statement",
 "invoice-settlement","invoice-activity-timeline","invoice-administrative-close",
 "invoice-details","invoice-followup-status"
])assert.ok(chooser.includes(action),"The picker must provide "+action);

assert.ok(client.includes("onClick={()=>registerPayment(false)}"),
 "Payment must still require original confirmation");
assert.ok(client.includes("onClick={()=>sendManualReceipt(p)}"),
 "Payment receipts must remain available");
assert.ok(client.includes("onClick={sendInvoice}"),
 "Draft invoice send must remain available");
assert.ok(client.includes('<InvoiceSplitPanel'),"Draft split workflow must remain mounted");
assert.ok(client.includes('<InvoiceCustomerPicker'),"Draft customer workflow must remain");
assert.ok(css.includes(".activeActionHeader")&&css.includes(".overviewDisclosure"),
 "Selected action must be visibly distinct and the overview collapsible");
assert.ok(css.includes('.actionButton[aria-pressed="true"]'),
 "Selected action button needs visible highlight");
console.log("Fakturahandlinger som knappevalg bestått: bare valgt panel vises, alle 12 seksjoner skjult fra starten, skjult samleoversikt, avslutt/bytt handling, original betaling og kladd bevart.");
