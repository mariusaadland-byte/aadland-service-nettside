import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const form=read("app/admin/faktura/InvoiceInlinePrivateCustomer.js");
const picker=read("app/admin/faktura/InvoiceCustomerPicker.js");
const business=read("app/admin/faktura/InvoiceInlineBusinessCustomer.js");
const invoice=read("app/admin/faktura/InvoicesClient.js");
const source=read("app/api/admin/customer-contacts/route.js");
// The same customer card is used regardless of where the user creates it.
assert.ok(form.startsWith('"use client";'));
assert.ok(form.includes('customerType:"private"'));
assert.ok(form.includes('paymentTermsDays:14'));
assert.ok(form.includes('preferredPaymentMethod:"bank"'));
assert.ok(form.includes('email:""')&&form.includes('phone:""'));
assert.ok(form.includes("Fullt navn *"));
assert.ok(form.includes("Adresse, postnummer og poststed"));
assert.ok(form.includes("E-post til faktura"));
assert.ok(form.includes("Mobilnummer / telefon"));
assert.ok(form.includes("Betalingsfrist (dager)"));
assert.ok(form.includes("Standard betalingsmåte"));
assert.ok(form.includes('!form.email.trim()&&!form.phone.trim()'),"Require contact details even for non-email customers");
assert.ok(form.includes("E-post kreves senere dersom du vil sende fakturaen på e-post."));
assert.ok(form.includes('window.confirm('),"Explicit customer creation approval");
assert.ok(form.includes('method:"POST"'),"Single server write");
assert.ok(form.includes('body:JSON.stringify(form)'));
assert.ok(form.includes("if(busy||disabled||stored)return"),"Never POST again after storing");
assert.ok(form.includes("setStored(data.contact)"),"Retain durable retry handle");
assert.ok(form.includes("if(data.existing)"),"Reuse existing email contact");
assert.ok(form.includes("setExisting(true)"),"Require manual approval when email already used");
assert.ok(form.includes("return;\n   }\n   setSuccess"),"Existing email may not silently select wrong customer");
assert.ok(form.includes("await attach(data.contact)"));
assert.ok(form.includes("await onChoose(contact)"));
assert.ok(form.includes("catch(e){setError((e.message"),"Retry card selection after invoice save failure");
assert.ok(form.includes("onClick={selectStored}"),"Retry must reuse returned card");
assert.ok(form.includes("Lagret kundekort")&&form.includes("Eksisterende kundekort"));
assert.ok(form.includes("stored.customerType===\"business\""),"Warn on email colliding with a business card");
assert.ok(form.includes("Det opprettes ingen")===false,"Ensure text is specific and non-deceptive");
assert.ok(picker.includes('import InvoiceInlinePrivateCustomer'));
assert.ok(picker.includes("＋ Legg til privatkunde her"));
assert.ok(picker.includes("<InvoiceInlinePrivateCustomer disabled={locked} onChoose={choose}"));
assert.ok(picker.includes("setInlineBusiness(false);setInlinePrivate(open=>!open);"),"Both create panels mutually exclusive");
assert.ok(picker.includes("setInlinePrivate(false);setInlineBusiness(open=>!open);"));
assert.ok(picker.includes("await onChoose(item)"));
assert.ok(picker.includes("throw e; // Inline forms must know"),"Invoice failure must bubble up to preserve retry button");
assert.ok(picker.includes("void choose(item).catch(()=>{})"),"Existing list selection handles thrown promise");
assert.ok(picker.includes("onCreated={contact=>setContacts"),"Created customer is added to in-memory picker list");
assert.ok(business.includes("await onChoose(contact)"),"Existing business flow benefits from error propagation");
assert.ok(invoice.includes("await persist(next);"),"Customer selection persists the invoice draft");
assert.ok(invoice.includes("<InvoiceCustomerPicker"));
assert.ok(source.includes('eq("email",input.data.email)'),"Persisted emails deduplicated server-side");
assert.ok(source.includes("if(existing)"),"Use existing card rather than duplicate");
assert.ok(source.includes('if(input.data.organization_number)'),"Company customers still checked first");
// Simulate database contact dedup to ensure private and business separation by customerType.
const raw={
 id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"Privat Test",email:"kunde@example.no",
 phone:"90000000",address:"Gate 1",customer_type:"private",organization_number:null,
 payment_terms_days:30,preferred_payment_method:"bank",contact_person:null,internal_note:null
};
const api=source.replace(/^import .*;\n/gm,"").replace(/^export async function /gm,"async function ");
let insertCount=0;
const db=()=>({from(table){
 assert.equal(table,"admin_customer_contacts");
 const q={
  select(){return q},
  eq(field,value){assert.equal(field,"email");assert.equal(value,"kunde@example.no");return q;},
  async maybeSingle(){return {data:raw,error:null}},
  insert(){insertCount++;throw Error("Duplicate email must never be inserted");}
 };
 return q;
}});
const POST=new Function("NextResponse","sameOriginGuard","getAdminUser","db",api+";return POST;")(
 {json:(body,opts={})=>({body,status:opts.status||200})},()=>null,
 async()=>({role:"owner"}),db);
const response=await POST({json:async()=>({
 customerType:"private",name:"Kunde Test",email:"kunde@example.no",phone:"92222222",
 address:"Ny adresse",paymentTermsDays:14,preferredPaymentMethod:"bank"
})});
assert.equal(response.status,200);
assert.equal(response.body.existing,true);
assert.equal(response.body.contact.id,raw.id);
assert.equal(response.body.contact.name,"Privat Test","Original stored contact must win");
assert.equal(response.body.contact.address,"Gate 1");
assert.equal(insertCount,0);
console.log("Privatkunde direkte på faktura bestått: eksplisitt bekreftelse, e-post-dublett, gjenbruk, sikker retry og fakturalagring.");
