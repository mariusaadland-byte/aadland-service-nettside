import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const route=read("app/api/admin/invoices/route.js")
 .replace(/^import .*;\n/gm,"").replace(/^export async function /gm,"async function ");
const contactId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const invoiceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let role="owner",days=21,writes=0,updates=[],responseDeadline;
const db=()=>({from(table){
 if(table==="admin_customer_contacts"){
  const q={select(){return q},eq(key,val){assert.equal(key,"id");assert.equal(val,contactId);return q},
   async maybeSingle(){return {data:{
    id:contactId,name:"Testbedrift AS",email:"kunde@example.invalid",phone:"90000000",
    address:"Nygata 2",customer_type:"business",organization_number:"987654321",
    contact_person:"Kontakt",payment_terms_days:days,preferred_payment_method:"bank"
   },error:null}}};return q;
 }
 assert.equal(table,"invoice_drafts");
 const q={update(value){updates.push(value);return q},eq(){return q},select(){return q},
  async maybeSingle(){writes++;return {data:{id:invoiceId,updated_at:"2026-10-26T15:30:01Z"},error:null}}};
 return q;
}});
const PATCH=new Function("NextResponse","getAdminUser","db","withInvoicePaymentTerms","summarizeInvoiceActivity",
 "osloDateKey","sameOriginGuard",route+";return PATCH;")(
 {json:(body,opt={})=>({status:opt.status||200,body})},
 async()=>({role}),db,()=>null,()=>null,()=>"2026-10-26",()=>null
);
const base={
 id:invoiceId,expectedUpdatedAt:"2026-10-26T15:20:01Z",title:"Montasje",
 customer:{contactId,name:"Utgått kunde",email:"gammel@example.invalid",
  paymentTermsDays:14,workDate:"2026-10-25",paymentMethod:"bank"},
 lineItems:[{description:"Montasje",quantity:1,unitPriceOre:25000,vatRate:25}],
 pricingModel:"fixed",dueDateMode:"auto",dueDate:"2026-11-09",notes:""
};
let r=await PATCH({json:async()=>base});
assert.equal(r.status,200);
assert.equal(updates.at(-1).due_date,"2026-11-16",
 "Server must compute date from linked 21-day customer terms, not browser's stale 14 days");
assert.equal(r.body.savedDueDate,"2026-11-16");
assert.equal(r.body.savedCustomer.paymentTermsDays,21);
assert.equal(updates.at(-1).customer.name,"Testbedrift AS");
days=30;
r=await PATCH({json:async()=>base});
assert.equal(updates.at(-1).due_date,"2026-11-25");
assert.equal(r.body.savedDueDate,"2026-11-25");
r=await PATCH({json:async()=>({...base,dueDateMode:"manual",dueDate:"2026-12-15"})});
assert.equal(updates.at(-1).due_date,"2026-12-15");
assert.equal(r.body.savedDueDate,"2026-12-15");
r=await PATCH({json:async()=>({...base,customer:{name:"Fritekst kunde",
 email:"fri@example.invalid",paymentTermsDays:60},dueDateMode:"auto"})});
assert.equal(updates.at(-1).due_date,"2026-11-09",
 "Unlinked invoice must match existing 14-day issue fallback and GET preview");
assert.equal(r.body.savedDueDate,"2026-11-09");
role="none";
const savedCount=writes;r=await PATCH({json:async()=>base});
assert.equal(r.status,403);assert.equal(writes,savedCount);
const helper=read("lib/invoiceCanonicalSave.js").replace(/^export /gm,"");
const {invoiceSavedDraft}=new Function(helper+";return {invoiceSavedDraft};")();
const snapshot={...base,customer:{...base.customer,name:"Testbedrift AS",
 email:"kunde@example.invalid",address:"Nygata 2",phone:"90000000",
 customerType:"business",organizationNumber:"987654321",contactPerson:"Kontakt",paymentTermsDays:30}};
let changed=invoiceSavedDraft(snapshot,{
 updatedAt:"2026-10-26T15:30:02Z",savedCustomer:snapshot.customer,
 savedDueDate:"2026-11-25"});
assert.deepEqual(changed.changed.map(x=>x.key),["due_date"]);
assert.equal(changed.invoice.due_date,"2026-11-25");
assert.equal(changed.invoice.customer.email,"kunde@example.invalid");
const manual={...snapshot,due_date_mode:"manual",due_date:"2026-12-31"};
changed=invoiceSavedDraft(manual,{updatedAt:"2026-10-26T15:30:02Z",
 savedCustomer:manual.customer,savedDueDate:"2026-12-31"});
assert.deepEqual(changed.changed,[]);
assert.equal(changed.invoice.due_date,"2026-12-31");
assert.throws(()=>invoiceSavedDraft(snapshot,{updatedAt:"2026-10-26T15:30:02Z",
 savedCustomer:snapshot.customer}),/bekreftes/,"Do not silently accept missing saved due date");
const ui=read("app/admin/faktura/InvoicesClient.js");
assert.ok(ui.includes("if(savedInvoice.changed.length)"),"Must pause issuance after any canonical change");
assert.ok(ui.includes("...savedInvoice.invoice"),"UI must update due date with response");
const sql=read("supabase/migrations/20261021170655_customer_invoice_payment_terms.sql");
assert.ok(sql.includes("i.due_date:=today+(terms->>'days')::integer"),
 "Issued invoice will continue calculating auto deadline from customer terms");
console.log("Fakturaforfall bestått: 14/21/30 dager, lagret dato, manuell dato, gjenvisning, autorisasjon og utstedelsesguard.");
