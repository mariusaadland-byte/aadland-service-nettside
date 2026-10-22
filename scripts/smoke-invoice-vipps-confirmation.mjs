import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const shared=readFileSync("lib/invoicePaymentStatus.js","utf8").replace(/^export /gm,"");
const snapshot=new Function(shared+";return invoiceVippsConfirmationSnapshot;")();
const source=readFileSync("lib/invoiceVipps.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const verify=new Function("invoiceVippsConfirmationSnapshot",source+";return verifyVippsConfirmation;")(snapshot);

const invoice={
 id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
 status:"draft",pricing_model:"hourly",
 title:"Montering på bad",notes:"To timer etter avtale",
 customer:{name:"Test Kunde",email:"test@example.invalid",address:"Testgata 42, Bergen",
  phone:"55555555",workDate:"2026-10-22",workAddress:"Testgata 42, Bergen",workDescription:"Montering"},
 line_items:[{description:"Arbeid",type:"work",unit:"time",quantity:2,unitPriceOre:40000,vatRate:25},
  {description:"Materialer",type:"materials",unit:"stk",quantity:1,unitPriceOre:25000,vatRate:25}],
 paid_ore:0
};
const confirmed=snapshot(invoice);
assert.equal(confirmed.totalOre,131250);
assert.doesNotThrow(()=>verify(invoice,confirmed));
const changed=[
 ["Kundenavn",i=>{i.customer.name="En annen kunde";}],
 ["E-post",i=>{i.customer.email="wrong@example.invalid";}],
 ["Adresse",i=>{i.customer.address="En annen adresse";}],
 ["Arbeidsdato",i=>{i.customer.workDate="2026-10-23";}],
 ["Beskrivelse",i=>{i.customer.workDescription="Annen jobb";}],
 ["Prislinje",i=>{i.line_items[0].unitPriceOre=39000;}],
 ["Linjetekst med samme beløp",i=>{i.line_items[0].description="Noe annet";}],
 ["MVA med samme grunnpris",i=>{i.line_items[0].vatRate=0;}],
 ["Manuelt innbetalt i mellomtiden",i=>{i.paid_ore=50000;}],
 ["Endret notat",i=>{i.notes="Andre betingelser";}]
];
for(const [name,mutate] of changed){
 const current=structuredClone(invoice);mutate(current);
 assert.throws(()=>verify(current,confirmed),/endret seg etter bekreftelsen/,name);
}
const changedRevision=structuredClone(invoice);
changedRevision.updated_at="2026-10-22T17:30:00Z";
changedRevision.status="issued";
changedRevision.invoice_number="AS-WEB-2026-000123";
changedRevision.issued_date="2026-10-22";
changedRevision.due_date="2026-11-05";
assert.doesNotThrow(()=>verify(changedRevision,confirmed),"Invoice issuance may add number and recompute due date");
assert.throws(()=>verify(invoice,null),/Bekreft faktura/);
assert.throws(()=>verify(invoice,{}),/endret seg etter bekreftelsen/);
const paid=structuredClone(invoice);paid.paid_ore=confirmed.totalOre;
assert.throws(()=>verify(paid,snapshot(paid)),/betalt eller beløpet er ugyldig/);
const client=readFileSync("app/admin/faktura/InvoiceVippsPanel.js","utf8");
const route=readFileSync("app/api/admin/invoices/vipps/route.js","utf8");
assert.ok(client.includes("confirmedInvoice:invoiceVippsConfirmationSnapshot(invoice)"),"Client sends owner-reviewed invoice details");
assert.ok(route.includes("startInvoiceVipps(s,found.data,b.confirmedInvoice)"),"Server passes reviewed details to payment start");
assert.ok(source.split("verifyVippsConfirmation(invoice,confirmation)").length===3,"Validate before invoice issue and after provider reconciliation");
console.log("Vipps-fakturabekreftelse bestått: kunde, e-post, adresse, alle prislinjer, MVA, tidligere innbetaling, serverkontroll og oppdatert fakturanummer.");
