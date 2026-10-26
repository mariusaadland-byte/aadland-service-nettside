import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const helper=read("lib/invoiceCustomerCardReview.js").replace(/^export /gm,"");
const {invoiceCustomerCardReview}=new Function(helper+";return {invoiceCustomerCardReview};")();
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const record={id,name:"Kunde AS",customerType:"business",
 organizationNumber:"987654321",contactPerson:"Marta Kontakt",
 address:"Nyveien 3",email:"faktura@example.invalid",phone:"91234567",
 paymentTermsDays:21,preferredPaymentMethod:"vipps",
 internalNote:"HEMMELIG_KUN_ADMIN",updatedAt:"2026-10-26T15:00:00Z"};
const stale={contactId:id,name:"Kunde AS",customerType:"business",
 organizationNumber:"987654321",contactPerson:"",
 address:"Gammelveien 1",email:"faktura@example.invalid",phone:"91234567",
 paymentTermsDays:14,paymentMethod:"bank",workDescription:"Montering",
 workDate:"2026-10-26",workAddress:"Annet arbeidssted"};
const review=invoiceCustomerCardReview(stale,record);
assert.equal(review.changed,true);
assert.deepEqual(review.fields.map(f=>f.key),["contactPerson","address","paymentTermsDays"]);
assert.equal(review.fields.find(x=>x.key==="address").onInvoice,"Gammelveien 1");
assert.equal(review.fields.find(x=>x.key==="address").onCard,"Nyveien 3");
assert.ok(!JSON.stringify(review).includes("HEMMELIG_KUN_ADMIN"));
assert.ok(!JSON.stringify(review).includes("vipps"),"Never silently suggest changing chosen payment route");
assert.ok(!JSON.stringify(review).includes("workDescription"));
assert.equal(invoiceCustomerCardReview({...stale,contactPerson:record.contactPerson,
 address:record.address,paymentTermsDays:21},record).changed,false);
assert.throws(()=>invoiceCustomerCardReview({...stale,contactId:"different"},record),/stemmer ikke/);
assert.throws(()=>invoiceCustomerCardReview(stale,null),/stemmer ikke/);
const oldBusiness={...stale,customerType:"business",organizationNumber:"987654321",contactPerson:"Marta Kontakt"};
const privateCard={...record,customerType:"private",organizationNumber:"",contactPerson:""};
const changedType=invoiceCustomerCardReview(oldBusiness,privateCard);
assert.deepEqual(changedType.fields.map(f=>f.key).filter(key=>["customerType","organizationNumber","contactPerson"].includes(key)),
 ["customerType","organizationNumber","contactPerson"]);
const routeSource=read("app/api/admin/customer-contacts/route.js")
 .replace(/^import .*;\n/gm,"").replace(/^export async function /gm,"async function ");
let currentRole="owner",failRead=false,found=true,reads=0;
const db=()=>({from(table){
 assert.equal(table,"admin_customer_contacts");
 const query={select(){return query},
  eq(k,v){assert.equal(k,"id");assert.equal(v,id);return query},
  async maybeSingle(){reads++;return failRead?{data:null,error:{code:"db-failure"}}:{
   data:found?{id,name:"Kunde AS",customer_type:"business",organization_number:"987654321",
    contact_person:"Marta Kontakt",email:"faktura@example.invalid",
    address:"Nyveien 3",phone:"91234567",payment_terms_days:21}:null,error:null
  }};
 return query;
}});
const GET=new Function("NextResponse","sameOriginGuard","getAdminUser","db",routeSource+
 ";return GET;")({json:(body,options={})=>({body,status:options.status||200,
 headers:options.headers||{}})},()=>null,
 async()=>currentRole?{role:currentRole}:null,db);
const req=qs=>({url:"https://localhost/api/admin/customer-contacts"+qs});
let r=await GET(req("?contactId="+id));
assert.equal(r.status,200);
assert.equal(r.body.contact.organizationNumber,"987654321");
assert.equal(r.body.contact.contactPerson,"Marta Kontakt");
assert.equal(r.headers["Cache-Control"],"private, no-store");
assert.equal(reads,1);
r=await GET(req("?contactId=garbage"));
assert.equal(r.status,400);
assert.equal(reads,1);
found=false;r=await GET(req("?contactId="+id));
assert.equal(r.status,200);assert.equal(r.body.contact,null);
found=true;failRead=true;r=await GET(req("?contactId="+id));
assert.equal(r.status,503,"Failure should never appear as no differences");
failRead=false;currentRole=null;r=await GET(req("?contactId="+id));
assert.equal(r.status,403);
currentRole="owner";
const ui=read("app/admin/faktura/InvoiceCustomerCardReview.js");
const picker=read("app/admin/faktura/InvoiceCustomerPicker.js");
const editor=read("app/admin/faktura/InvoicesClient.js");
const selection=read("lib/invoiceCustomerSelection.js");
assert.ok(ui.includes("invoiceCustomerCardReview(customer,contact)"));
assert.ok(ui.includes("Sjekk fakturakunden mot kunderegisteret"));
assert.ok(ui.includes("window.confirm"),"Must confirm changing billing information");
assert.ok(ui.includes("await onChoose(contact)"),"User must initiate draft write");
assert.ok(ui.includes("Ingen ting blir sendt")===false);
assert.ok(ui.includes("Arbeidsbeskrivelse, leveringsdato"));
assert.ok(ui.includes("setError(e.message"),"Display failure and don't hide discrepancy");
assert.ok(picker.includes("<InvoiceCustomerCardReview customer={customer}"));
assert.ok(picker.includes("sourceQuoteId={sourceQuoteId}"));
assert.ok(editor.includes("sourceQuoteId={form.source_quote_id"));
assert.ok(selection.includes('invoice.status!=="draft"'),"Issued documents stay locked");
assert.ok(selection.includes("...(invoice.customer||{})"),"Job details survive customer change");
assert.ok(selection.includes('invoice.due_date_mode||"auto"'),"Manual due date is kept");
assert.ok(!helper.includes("internalNote"),"Internal notes never displayed in review");
assert.ok(!helper.includes("preferredPaymentMethod"),"No accidental payment method changes");
console.log("Fakturakunde avstemming bestått: endringsliste, bekreftelse, kundekort per ID, feilhåndtering, manuelt valg, bevart arbeid og utstedte fakturaer låst.");
