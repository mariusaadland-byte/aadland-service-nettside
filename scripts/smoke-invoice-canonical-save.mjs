import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const src=read("lib/invoiceCanonicalSave.js").replace(/^export /gm,"");
const {invoiceCustomerSaveDifferences,invoiceSavedDraft}=new Function(src+
 ";return {invoiceCustomerSaveDifferences,invoiceSavedDraft};")();
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const source={id,updated_at:"2026-10-26T15:40:00Z",status:"draft",due_date_mode:"manual",due_date:"2026-11-07",
 customer:{contactId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"Eksempel AS",
  email:"gammel@example.invalid",address:"Gammelveien 1",phone:"90000000",
  customerType:"business",organizationNumber:"987654321",contactPerson:"Per",
  paymentTermsDays:14,paymentMethod:"vipps",workDescription:"Innvendig maling",
  workDate:"2026-10-26",workAddress:"Bergen"},
 line_items:[{description:"Montering",quantity:1,unitPriceOre:10000,vatRate:25}],
 notes:"Manuelt avtalt arbeid"};
const canonical={...source.customer,email:"ny@example.invalid",address:"Nyveien 3",
 contactPerson:"Kari",paymentTermsDays:30};
const diffs=invoiceCustomerSaveDifferences(source.customer,canonical);
assert.deepEqual(diffs.map(x=>x.key),["email","address","contactPerson","paymentTermsDays"]);
assert.equal(diffs[0].previous,"gammel@example.invalid");
assert.equal(diffs[0].saved,"ny@example.invalid");
assert.deepEqual(invoiceCustomerSaveDifferences({...source.customer,...canonical},canonical),[]);
const saved=invoiceSavedDraft(source,{updatedAt:"2026-10-26T15:42:00Z",savedCustomer:canonical});
assert.deepEqual(saved.changed.map(x=>x.key),diffs.map(x=>x.key));
assert.equal(saved.invoice.customer.address,"Nyveien 3");
assert.equal(saved.invoice.customer.paymentMethod,"vipps","Keep agreed payment method");
assert.equal(saved.invoice.customer.workDescription,"Innvendig maling");
assert.equal(saved.invoice.updated_at,"2026-10-26T15:42:00Z");
assert.equal(saved.invoice.due_date,"2026-11-07","Never change a manual due date");
assert.deepEqual(saved.invoice.line_items,source.line_items,"Never change prices");
assert.equal(source.customer.email,"gammel@example.invalid","Never mutate form snapshot");
const unlinked={...source,customer:{...source.customer,contactId:""}};
assert.deepEqual(invoiceCustomerSaveDifferences(unlinked.customer,{...unlinked.customer,name:"Annen"}),[],
 "Unlinked free-text draft is not compared with a customer card");
assert.throws(()=>invoiceSavedDraft(source,{updatedAt:"2026-10-26T15:42:00Z"}),/Lagring kunne ikke bekreftes/);
assert.throws(()=>invoiceCustomerSaveDifferences(source.customer,null),/Last inn fakturakladden/);
const route=read("app/api/admin/invoices/route.js");
assert.ok(route.includes("savedCustomer:update.customer"),"PATCH must return server-selected canonical customer");
assert.ok(route.includes('eq("status","draft")'),"Server must never change issued invoices");
assert.ok(route.includes('eq("updated_at",body.expectedUpdatedAt)'),"Optimistic concurrency must remain");
const page=read("app/admin/faktura/InvoicesClient.js");
assert.ok(page.includes("import {invoiceSavedDraft}"));
assert.ok(page.includes("const savedInvoice=invoiceSavedDraft(snapshot,data)"));
assert.ok(page.includes("...savedInvoice.invoice"),"Client must display exactly what server saved");
assert.ok(page.includes("if(savedInvoice.changed.length)"));
assert.ok(page.includes("Ingen faktura er utstedt eller sendt."));
assert.ok(page.includes("const saved=await persist(next);"));
assert.ok(page.includes("setForm(saved.invoice)"),"Customer choose must not restore stale snapshot");
assert.ok(page.includes('if(form.status==="draft")await persist(form);'),"Print / customer navigation guard");
assert.ok(page.includes('if(invoice.status==="draft")await persist(invoice)')===false);
const vipps=read("app/admin/faktura/InvoiceVippsPanel.js");
assert.ok(vipps.includes('if(invoice.status==="draft")await persist(invoice)'),
 "Vipps must also stop if customer changes under it");
const pdf=read("app/api/admin/invoices/pdf/route.js");
assert.ok(pdf.includes('select("*")'),"PDF uses the persisted invoice from DB");
const send=read("app/api/admin/invoices/send/route.js");
assert.ok(send.includes('select("*")'),"Email issuance must use the persisted invoice from DB");
console.log("Lagret fakturamottaker bestått: oppdag avvik, stopp utstedelse, behold arbeid og forfall, server-snapshot og personvern.");
