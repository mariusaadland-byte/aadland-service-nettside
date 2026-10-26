import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const api=read("app/api/admin/quotes/route.js");
const start=api.indexOf("function sanitizeCustomer(value){");
const end=api.indexOf("function sanitizeLines(value){",start);
assert.ok(start>=0&&end>start,"Quote customer serializer is available");
const code=api.slice(start,end);
const sanitize=new Function("clean",code+";return sanitizeCustomer;")(
 (v,max=4000)=>String(v??"").trim().slice(0,max));
const card={
 id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Firma Eksempel AS",
 customerType:"business",organizationNumber:"987 654 321",contactPerson:"Kari Kontakt",
 email:"FAKTURA@example.invalid",phone:"90000000",address:"Eksempelgata 1",
 paymentTermsDays:30,internalNote:"MÅ IKKE BLI MED PÅ TILBUD",
 preferredPaymentMethod:"vipps"
};
let c=sanitize({...card,contactId:card.id});
assert.equal(c.customerType,"business");
assert.equal(c.organizationNumber,"987654321");
assert.equal(c.contactPerson,"Kari Kontakt");
assert.equal(c.paymentTermsDays,30);
assert.equal(c.email,"faktura@example.invalid");
assert.equal(c.contactId,card.id);
assert.equal(c.internalNote,undefined);
assert.equal(c.preferredPaymentMethod,undefined);
c=sanitize({...card,customerType:"private"});
assert.equal(c.customerType,"private");
assert.equal(c.organizationNumber,"");
assert.equal(c.contactPerson,"");
assert.equal(sanitize({...card,paymentTermsDays:999}).paymentTermsDays,14);
assert.equal(sanitize({...card,paymentTermsDays:0}).paymentTermsDays,0);
assert.ok(api.includes("Bedriftens organisasjonsnummer må bestå av ni sifre."));
const picker=read("app/admin/tilbud/QuoteCustomerPicker.js");
assert.ok(picker.includes("customerType:contact.customerType"));
assert.ok(picker.includes("organizationNumber:contact.customerType"));
assert.ok(picker.includes("contactPerson:contact.customerType"));
assert.ok(picker.includes("item.organizationNumber"));
assert.ok(picker.includes("Org.nr."));
assert.ok(picker.includes('organizationNumber:"",contactPerson:""'),"Changing customer clears prior org number");
const editor=read("app/admin/tilbud/QuoteEditorClient.js");
assert.ok(editor.includes("organizationNumber:quote.customer?.organizationNumber"),"Load saved quote company org");
assert.ok(editor.includes("contactPerson:quote.customer?.contactPerson"));
assert.ok(editor.includes("organizationNumber:String(initialCustomer.organizationNumber"),"Other quote creation paths retain org");
const direct=read("app/api/admin/quotes/direct-invoice/route.js");
assert.ok(direct.includes("customer_type,organization_number,contact_person"));
assert.ok(direct.includes("organizationNumber:contact.customer_type"));
assert.ok(direct.includes("contactPerson:contact.customer_type"));
assert.ok(direct.includes('const {data:contact,error:contactError}'),"Invoice must use authoritative customer record");
const pdf=read("lib/quotePdf.js");
assert.ok(pdf.includes('field("Org.nr.",customer.organizationNumber)'));
assert.ok(pdf.includes('field("Kontaktperson",customer.contactPerson)'));
assert.ok(pdf.includes('customer.customerType==="business"'));
const preview=read("app/admin/tilbud/[id]/preview/QuotePreviewClient.js");
assert.ok(preview.includes("Org.nr. {quote.customer.organizationNumber}"));
assert.ok(preview.includes("Kontaktperson: {quote.customer.contactPerson}"));
assert.ok(!pdf.includes("customer.internalNote"));
assert.ok(!preview.includes("customer.internalNote"));
console.log("Bedriftskunde i tilbud bestått: org.nr., kontaktperson, private felt, API, lagring og fakturakonvertering.");
