import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const invoiceTerms=readFileSync("lib/invoicePaymentTerms.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const vippsDate=readFileSync("lib/invoiceVippsDate.js","utf8").replace(/^export /gm,"");
const helper=readFileSync("lib/invoiceCustomerSelection.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const select=new Function(vippsDate+";"+invoiceTerms+";"+helper+";return invoiceWithSelectedCustomer;")();
const today="2026-10-23";
const base={
 id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",status:"draft",
 title:"Arbeid allerede skrevet",customer:{name:"Gammelt navn",email:"old@example.invalid",paymentMethod:"vipps",workDate:"2026-10-20",workAddress:"Arbeidssted 3",workDescription:"Behold denne jobbbeskrivelsen"},
 line_items:[{description:"Tømrerarbeid",quantity:7,unit:"timer",unitPriceOre:40000,vatRate:25}],
 due_date_mode:"auto",due_date:"2026-10-30",updated_at:"2026-10-23T11:01:01Z"
};
const contact={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"Registrert Kunde AS",email:"faktura@example.invalid",
 phone:"98765432",address:"Gate 12, 5000 Bergen",paymentTermsDays:30,customerType:"business",organizationNumber:"987654321",contactPerson:"Anne",preferredPaymentMethod:"vipps",internalNote:"Kun for ansatte"};
const changed=select(base,contact,today);
assert.equal(changed.customer.contactId,contact.id);
assert.equal(changed.customer.name,contact.name);
assert.equal(changed.customer.email,contact.email);
assert.equal(changed.customer.phone,contact.phone);
assert.equal(changed.customer.address,contact.address);
assert.equal(changed.customer.paymentTermsDays,30);
assert.equal(changed.customer.organizationNumber,"987654321");
assert.equal(changed.customer.customerType,"business");
assert.equal(changed.customer.paymentMethod,"vipps");
assert.equal(changed.customer.internalNote,undefined,"Internal customer notes must never appear on invoice");
assert.equal(changed.due_date,"2026-11-22");
assert.equal(changed.customer.paymentMethod,"vipps","Preserve payment method already selected on draft");
assert.equal(changed.customer.workDate,today,"Vipps invoicing uses the current Oslo delivery day, even when a customer is selected");
assert.equal(changed.customer.workAddress,base.customer.workAddress);
assert.equal(changed.customer.workDescription,base.customer.workDescription);
assert.equal(select({...base,customer:{...base.customer,paymentMethod:"bank"}},contact,today).customer.workDate,base.customer.workDate,"Bank invoices keep chosen delivery date");
assert.deepEqual(changed.line_items,base.line_items);
assert.deepEqual(base.customer,{name:"Gammelt navn",email:"old@example.invalid",paymentMethod:"vipps",workDate:"2026-10-20",workAddress:"Arbeidssted 3",workDescription:"Behold denne jobbbeskrivelsen"},"Do not mutate invoice until saved");
const manual=select({...base,due_date_mode:"manual",due_date:"2026-12-03"},contact,today);
assert.equal(manual.due_date,"2026-12-03","Do not override custom invoice due dates");
assert.equal(select({...base,customer:{}},contact,today).customer.paymentMethod,"vipps","New invoice adopts customer's default payment preference");
assert.throws(()=>select({...base,status:"issued"},contact,today),/Bare fakturakladder/);
assert.throws(()=>select(base,{name:"Not persisted"},today),/Velg en lagret kunde/);
const source=readFileSync("app/api/admin/invoices/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replaceAll("export async function ","async function ");
const rev="2026-10-23T09:00:00.000Z";
const registered={...contact,payment_terms_days:30,customer_type:"business",organization_number:"987654321",preferred_payment_method:"vipps"};
let saved=null,writes=0;
const db=()=>({
 from(table){
  const q={select(){return q},eq(){return q},update(data){assert.equal(table,"invoice_drafts");saved=data;return q},
   async maybeSingle(){
    if(table==="admin_customer_contacts")return {data:registered,error:null};
    if(table==="invoice_drafts"){writes++;return {data:{id:base.id,updated_at:"2026-10-23T09:01:01.000Z"},error:null};}
    throw Error("Unexpected table "+table);
   }};
  return q;
 }
});
const api=new Function("NextResponse","getAdminUser","db","sameOriginGuard","withInvoicePaymentTerms","osloDateKey",
 source+";return PATCH;")(
 {json(body,opts={}){return {status:opts.status||200,body}}},
 async()=>({role:"owner"}),db,()=>null,()=>{},()=>today
);
const input=customer=>({
 id:base.id,expectedUpdatedAt:rev,customer,pricingModel:"fixed",title:"Fakturakladd",
 lineItems:[{description:"Arbeid",quantity:1,unit:"stk",unitPriceOre:10000,vatRate:25}],
 notes:"",dueDate:"2026-11-22",dueDateMode:"auto"
});
let r=await api({json:async()=>input({})});
assert.equal(r.status,200,"Allow saving unfinished invoice before customer registration");
assert.equal(writes,1);assert.equal(saved.customer.name,"");
r=await api({json:async()=>input({...changed.customer,name:"Falsk navn",email:"falsk@example.invalid"})});
assert.equal(r.status,200);
assert.equal(saved.customer.name,registered.name,"Billing information must come from central customer record");
assert.equal(saved.customer.email,registered.email);
assert.equal(saved.customer.phone,registered.phone);
assert.equal(saved.customer.address,registered.address);
assert.equal(saved.customer.paymentTermsDays,registered.payment_terms_days);
assert.equal(saved.customer.contactId,registered.id);
assert.equal(saved.customer.organizationNumber,registered.organization_number);
assert.equal(saved.customer.customerType,"business");
assert.equal(saved.customer.workDescription,base.customer.workDescription);
const oldWrites=writes;
r=await api({json:async()=>input({...changed.customer,contactId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"})});
assert.equal(r.status,200,"Mock returns registered contact for any contact ID"); // record-specific check occurs in DB, tested separately
assert.equal(writes,oldWrites+1);
r=await api({json:async()=>input({...changed.customer,contactId:"not-a-uuid"})});
assert.equal(r.status,400);

const ui=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
const picker=readFileSync("app/admin/faktura/InvoiceCustomerPicker.js","utf8");
const registerPage=readFileSync("app/admin/kunder/ny/page.js","utf8");
const registerClient=readFileSync("app/admin/kunder/ny/NewCustomerClient.js","utf8");
const existingCard=readFileSync("app/admin/kunder/[id]/CustomerCardClient.js","utf8");
const contactsApi=readFileSync("app/api/admin/customer-contacts/route.js","utf8");
const pdf=readFileSync("lib/invoiceDraftPdf.js","utf8");
const migration=readFileSync("supabase/migrations/20261023152300_admin_customer_card_settings.sql","utf8");
const contactsCode=contactsApi.replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const sanitizeContact=new Function(contactsCode+";return sanitize;")();
const registeredBusiness=sanitizeContact({name:"Byggfirma AS",email:"jobb@example.no",customerType:"business",organizationNumber:"987 654 321",contactPerson:"Ola",internalNote:"Intern rutine",preferredPaymentMethod:"vipps",paymentTermsDays:7});
assert.equal(registeredBusiness.data.organization_number,"987654321");
assert.equal(registeredBusiness.data.contact_person,"Ola");
assert.equal(registeredBusiness.data.internal_note,"Intern rutine");
assert.equal(registeredBusiness.data.preferred_payment_method,"vipps");
assert.equal(registeredBusiness.data.payment_terms_days,7);
assert.equal(sanitizeContact({name:"Privat",customerType:"private",organizationNumber:"987654321",contactPerson:"Ola"}).data.organization_number,null,"Private customers cannot inherit business ID");
assert.ok(sanitizeContact({name:"Bedrift",customerType:"business",organizationNumber:"123"}).error);
assert.ok(sanitizeContact({name:"Kunde",paymentTermsDays:366}).error);
assert.ok(sanitizeContact({name:"Kunde",preferredPaymentMethod:"free"}).error);
assert.ok(sanitizeContact({name:"Kunde",email:"not-an-email"}).error);
assert.ok(contactsApi.includes('user.canUpdateOrders||user.canManageProducts'),"Only edit-capable admins may create contacts");
assert.ok(contactsApi.includes("update_invoice_customer_card_v2"),"Customer card edits must persist all settings atomically");
assert.ok(contactsApi.includes("internal_note"),"Internal notes stored in private customer table");
assert.ok(registerClient.includes("organizationNumber"));
assert.ok(registerClient.includes("customerType"));
assert.ok(registerClient.includes("preferredPaymentMethod"));
assert.ok(registerClient.includes("Internt kundenotat"));
assert.ok(existingCard.includes("organisasjonsnummer")||existingCard.includes("Organisasjonsnummer"));
assert.ok(pdf.includes('invoice.customer?.organizationNumber?"Org.nr.: "'));
assert.ok(migration.includes("admin_customer_contacts")&&migration.includes("preferred_payment_method"));
assert.ok(!helper.includes("internalNote"),"Do not move internal notes from customer card to invoice");
assert.ok(ui.includes("<InvoiceCustomerPicker"),"Invoice editor must display central customer chooser");
assert.ok(ui.includes('window.location.assign("/admin/kunder/ny?invoiceId="'),"Dedicated registration page from invoice");
assert.ok(ui.includes("await persist(form);"),"Save draft before leaving editor");
assert.ok(ui.includes("await persist(next);"),"Choosing customer persists assignment");
assert.ok(ui.includes('params.get("customerId")'),"Return from registration automatically selects customer");
assert.ok(ui.includes("await selectCustomer(selected,draft)"));
assert.ok(!ui.includes("<label>Kundenavn <input"),"Remove retyping customer name in invoice editor");
assert.ok(!ui.includes("<label>Adresse <input"),"Remove retyping customer address in invoice editor");
assert.ok(picker.includes('fetch("/api/admin/customer-contacts",{cache:"no-store"})'));
assert.ok(picker.includes('aria-label="Velg fakturakunde"'));
assert.ok(picker.includes("＋ Ny kunde – åpne kunderegistrering"));
assert.ok(picker.includes("Åpne og rediger kundekortet"));
assert.ok(registerPage.includes("getAdminUser"),"Only authorized admins access registration page");
assert.ok(registerClient.includes('method:"POST"'));
assert.ok(registerClient.includes("paymentTermsDays:14"));
assert.ok(registerClient.includes('+"&customerId="+encodeURIComponent(data.contact.id)'),"Registration return links selected saved customer");
assert.ok(existingCard.includes('"&customerId="+encodeURIComponent(contact.id)'),"Updated customer returns to invoice");
console.log("Fakturakunde bestått: søk, kundekort, ny kunde, lagring/tilbakekomst, standard forfall, manuell frist, autoritativ DB og oppdragsdata bevart.");
