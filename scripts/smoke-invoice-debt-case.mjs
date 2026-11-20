import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const helper=read("lib/invoiceDebtCase.js").replace(/^export /gm,"");
const {invoiceDebtCaseReadiness}=new Function(helper+
 ";return {invoiceDebtCaseReadiness};")();
const invoice={id:"11111111-1111-4111-8111-111111111111",
 status:"sent",customer:{name:"En Kunde"},invoice_number:"AS-2026-1"};
const reminders=[{id:"22222222-2222-4222-8222-222222222222",
 kind:"inkasso",status:"sent",sent_at:"2026-11-01T12:00:00Z",due_date:"2026-11-16"}];
const payments=[{amount_ore:1000,reversed_at:null}];
const payment={outstanding:1500,paid:1000};
const settlement={needsReview:false};
const today="2026-11-21";
const test=(overrides={})=>invoiceDebtCaseReadiness({
 invoice,reminders,payments,payment,settlement,today,...overrides});
assert.equal(test().readyForManualReview,true);
assert.equal(test().verifiedOutstandingOre,1500);
assert.equal(test({reminders:[]}).readyForManualReview,false,"Missing inkasso notice");
assert.equal(test({reminders:[{...reminders[0],due_date:"2026-11-21"}]}).readyForManualReview,false,"Date must pass");
assert.equal(test({reminders:[...reminders,{...reminders[0],status:"failed",id:"other"}]}).readyForManualReview,false,"Failed send blocks case");
assert.equal(test({settlement:{needsReview:true}}).readyForManualReview,false,"Vipps/credit dispute blocks case");
assert.equal(test({payments:[{amount_ore:999,reversed_at:null}]}).readyForManualReview,false,"Payment discrepancies block");
assert.equal(test({payment:{...payment,outstanding:0}}).readyForManualReview,false,"Settled invoice");
assert.equal(test({invoice:{...invoice,status:"draft"}}).readyForManualReview,false);
assert.equal(test({payments:[{amount_ore:1000,reversed_at:"2026-11-20"}]}).readyForManualReview,false);
const route=read("app/api/admin/invoices/debt-case/route.js");
assert.ok(route.includes('user?.role!=="owner"'),"Owner only");
assert.ok(route.includes("invoiceSettlementInfo(current,today)"),"Reconciles Vipps and credits");
assert.ok(route.includes("invoiceDebtCaseReadiness("),"Fail closed");
assert.ok(route.includes("invoice_payments")&&route.includes("invoice_reminder_sends")&&route.includes("invoice_credit_notes"));
assert.ok(route.includes("format")==false||route.includes('get("format")==="print"'));
assert.ok(route.includes("htmlEscape")&&route.includes("no-store"),"Protected print HTML");
assert.ok(!route.includes("export async function POST("),"No automatic debt demand");
assert.ok(!route.includes("resend.emails.send"),"Never contacts customer");
const ui=read("app/admin/faktura/InvoiceDebtCasePanel.js");
assert.ok(ui.includes("Ingen ny betalingsoppfordring")&&ui.includes("&format=print"));
const panel=read("app/admin/faktura/InvoiceReminderPanel.js");
assert.ok(panel.includes("next.done&&<InvoiceDebtCasePanel"));
console.log("Internt inkasso-saksgrunnlag bestått: eierbeskyttet, kun lesing, betalings- og varslingskontroll, kreditering/Vipps, PDF-utskrift og ingen kundesending.");
