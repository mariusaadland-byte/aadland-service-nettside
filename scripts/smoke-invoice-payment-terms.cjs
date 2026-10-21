const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const c={Date};vm.createContext(c);vm.runInContext(fs.readFileSync("lib/invoicePaymentTerms.js","utf8").replaceAll("export function ","function "),c);
const contacts=[{id:"customer-1",email:"kunde@example.com",payment_terms_days:30},{id:"customer-2",email:"annen@example.com",payment_terms_days:7}];
const draft={status:"draft",customer:{contactId:"customer-1",email:"annen@example.com"},due_date:"2026-01-01",due_date_mode:"auto"};
assert.equal(c.withInvoicePaymentTerms(draft,contacts,"2026-10-21").due_date,"2026-11-20");
assert.equal(c.withInvoicePaymentTerms({...draft,customer:{email:"KUNDE@EXAMPLE.COM"}},contacts,"2026-10-21").due_date,"2026-11-20");
assert.equal(c.withInvoicePaymentTerms({...draft,customer:{}},contacts,"2026-10-21").due_date,"2026-11-04");
assert.equal(c.withInvoicePaymentTerms({...draft,due_date_mode:"manual"},contacts,"2026-10-21").due_date,"2026-01-01");
const issued={...draft,status:"sent"};assert.equal(c.withInvoicePaymentTerms(issued,contacts,"2026-10-21"),issued);
assert.equal(c.invoiceDueDate("2028-02-28",1),"2028-02-29");assert.equal(c.invoiceDueDate("2026-12-25",14),"2027-01-08");assert.equal(c.invoiceDueDate("2026-10-21",0),"2026-10-21");
console.log("PASS: customer terms, contact ID priority, email matching, default terms, manual override, frozen issued invoice and calendar boundaries.");

