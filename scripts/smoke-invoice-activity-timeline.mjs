import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync("lib/invoiceActivityTimeline.js","utf8").replace(/^export /gm,"");
const build=new Function(source+";return buildInvoiceActivityTimeline;")();
const invoice={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001",status:"issued",invoice_number:"AS-WEB-2026-000002",
 issued_at:"2026-10-20T10:00:00Z",sent_at:"2026-10-20T11:00:00Z"};
const payments=[
 {id:"ledger-1",amount_ore:15000,paid_on:"2026-10-21",recorded_at:"2026-10-21T11:00:00Z",note:"Manuell",reversed_at:null},
 {id:"ledger-2",amount_ore:20000,paid_on:"2026-10-22",recorded_at:"2026-10-22T10:00:00Z",
  reversed_at:"2026-10-24T09:00:00Z",vipps_reference:"ref-only"}
];
const vipps=[{id:"vipps-1",created_at:"2026-10-21T09:00:00Z",refunded_ore:7500,
 receipt_sent_at:"2026-10-22T11:00:00Z",delivery_method:"email_link"}];
const refundNotices=[{id:"refund-1",payment_id:"vipps-1",refunded_delta_ore:5000,
 created_at:"2026-10-23T12:00:00Z",sent_at:"2026-10-23T12:01:00Z"}];
const creditNotes=[{id:"credit-1",credit_number:"AS-KN-2026-000001",total_ore:2500,
 issued_at:"2026-10-23T14:00:00Z",sent_at:"2026-10-23T15:00:00Z",reason:"Prisavslag"}];
const reminders=[{id:"reminder-1",kind:"purring",status:"sent",
 created_at:"2026-10-22T08:00:00Z",sent_at:"2026-10-22T08:02:00Z",hasPdf:true}];
const events=build({invoice,payments,vipps,refundNotices,creditNotes,reminders});
assert.equal(events.length,13,"Issued, sent, ledger, reversed, request, receipt, refund, mails, credit, reminder, old refund");
assert.equal(events[0].kind,"reversal");
assert.equal(events.at(-1).id,"refund-historical:vipps-1");
assert.equal(events.at(-1).occurredAt,null,"Never fabricate a historical refund timestamp");
assert.equal(events.at(-1).amountOre,-2500,"Only the older uncovered refund amount is shown");
assert.equal(events.find(e=>e.id==="refund:refund-1").amountOre,-5000);
assert.equal(events.find(e=>e.id==="payment:ledger-1").amountOre,15000);
assert.equal(events.find(e=>e.id==="payment-reversed:ledger-2").amountOre,-20000);
assert.ok(events.find(e=>e.id==="credit:credit-1").link.includes("documentId=credit-1"));
assert.ok(events.find(e=>e.id==="reminder:reminder-1").link.includes("documentId=reminder-1"));
assert.ok(events.find(e=>e.id==="refund-mail:refund-1"),"Refund receipt email event is included");
assert.ok(events.find(e=>e.id==="credit-sent:credit-1"),"Credit emailed event is included");
assert.deepEqual(build({invoice:{...invoice,status:"draft"},payments}),[]);
assert.equal(build({invoice:{...invoice,sent_at:null},payments:[],vipps:[],refundNotices:[],creditNotes:[],reminders:[]}).length,1);
const noteOnly=build({invoice,refundNotices:[{...refundNotices[0],refunded_delta_ore:7500}],vipps});
assert.ok(!noteOnly.some(e=>e.id==="refund-historical:vipps-1"),"No duplicate historical refund event if notices match");

const client=readFileSync("app/admin/faktura/InvoiceActivityTimeline.js","utf8");
const archive=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
assert.ok(archive.includes("<InvoiceActivityTimeline"));
assert.ok(client.includes("cache:\"no-store\""));
assert.ok(client.includes("Hendelseslogg"));
assert.ok(client.includes("Vis alle "));
assert.ok(client.includes("Tidspunkt ikke lagret"));
assert.ok(!client.includes("async function send"),"The timeline is presentation only");
console.log("Faktura-hendelseslogg bestått: kronologi, korrekt øre, historiske datoer, purring, kvittering, reversering, PDF-lenker, ingen betalinger.");
