import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const apiCode=read("app/api/admin/invoices/route.js").replace(/^import .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",contactId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let role="owner",notFound=false,failRead=false,captured=null,updateCalls=0;
const db=()=>({from(table){
 if(table==="admin_customer_contacts"){
  const query={select(){return query;},eq(k,v){assert.equal(k,"id");assert.equal(v,contactId);return query;},
   async maybeSingle(){return failRead?{data:null,error:{code:"offline"}}:
    {data:notFound?null:{
     id:contactId,name:"Eksempel Firma AS",email:"firma@example.invalid",phone:"90000000",
     address:"Ny kundekort-adresse",payment_terms_days:21,customer_type:"business",
     organization_number:"987654321",contact_person:"Kari Kundekontakt",preferred_payment_method:"bank"
    },error:null};}};
  return query;
 }
 assert.equal(table,"invoice_drafts");
 const query={update(value){captured=value;updateCalls++;return query;},
  eq(){return query},select(){return query},
  async maybeSingle(){return {data:{id,updated_at:"2026-10-26T15:00:02Z"},error:null}}};
 return query;
}});
const {PATCH}=new Function("NextResponse","getAdminUser","db","withInvoicePaymentTerms",
 "summarizeInvoiceActivity","osloDateKey","sameOriginGuard",apiCode+";return {PATCH};")(
 {json:(body,options={})=>({body,status:options.status||200})},
 async()=>({role}),db,()=>{},()=>{},()=>"2026-10-26",()=>null
);
const body={id,expectedUpdatedAt:"2026-10-26T14:00:00Z",title:"VVS arbeid",
 pricingModel:"fixed",lineItems:[{description:"Arbeid",quantity:1,unit:"time",unitPriceOre:50000,vatRate:25}],
 customer:{contactId,customerType:"private",organizationNumber:"111111111",
  contactPerson:"GAMMEL KONTAKT",name:"Gammelt navn",address:"Gammel adresse",email:"wrong@example.invalid",
  workDescription:"Utført arbeid",workDate:"2026-10-26",workAddress:"Bergen",paymentMethod:"bank"}};
let r=await PATCH({json:async()=>body});
assert.equal(r.status,200);
assert.equal(captured.customer.name,"Eksempel Firma AS","Server uses current customer card");
assert.equal(captured.customer.organizationNumber,"987654321");
assert.equal(captured.customer.contactPerson,"Kari Kundekontakt");
assert.equal(captured.customer.customerType,"business");
assert.equal(captured.customer.address,"Ny kundekort-adresse");
assert.equal(captured.customer.paymentTermsDays,21);
assert.equal(captured.customer.workDescription,"Utført arbeid");
assert.equal(captured.customer.workAddress,"Bergen");
assert.equal(captured.customer.paymentMethod,"bank");
assert.equal(updateCalls,1);
notFound=true;r=await PATCH({json:async()=>body});
assert.equal(r.status,409,"Missing card must block invoice update");
assert.equal(updateCalls,1);
notFound=false;failRead=true;r=await PATCH({json:async()=>body});
assert.equal(r.status,409,"Database errors must block invoice update");
assert.equal(updateCalls,1);
failRead=false;role="guest";r=await PATCH({json:async()=>body});
assert.equal(r.status,403);
assert.equal(updateCalls,1);
role="owner";
r=await PATCH({json:async()=>({...body,customer:{
 name:"Privat Kunde",address:"Privatveien 3",customerType:"private",
 contactPerson:"MÅ IKKE VISES",organizationNumber:"999999999",paymentMethod:"bank"}})});
assert.equal(r.status,200);
assert.equal(captured.customer.customerType,"private");
assert.equal(captured.customer.organizationNumber,"");
assert.equal(captured.customer.contactPerson,"");
const lib=read("lib/invoiceCustomerSelection.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {invoiceWithSelectedCustomer}=new Function("invoiceDueDate","withVippsDeliveryDate",lib+
 ";return {invoiceWithSelectedCustomer};")((date,days)=>date+"+"+days,(v)=>v);
const invoice={status:"draft",due_date_mode:"auto",due_date:"",
 customer:{workDescription:"Utført maling",workAddress:"Vestland",paymentMethod:"bank"}};
const selected=invoiceWithSelectedCustomer(invoice,{
 id:contactId,name:"Eksempel Firma AS",customerType:"business",organizationNumber:"987654321",
 contactPerson:"Kari Kundekontakt",paymentTermsDays:21}, "2026-10-26");
assert.equal(selected.customer.organizationNumber,"987654321");
assert.equal(selected.customer.contactPerson,"Kari Kundekontakt");
assert.equal(selected.customer.workDescription,"Utført maling");
assert.equal(selected.customer.workAddress,"Vestland");
assert.equal(invoice.customer.organizationNumber,undefined);
assert.equal(invoiceWithSelectedCustomer(invoice,{
 id:contactId,name:"Privat",customerType:"private",organizationNumber:"999999999",contactPerson:"Feil"
},"2026-10-26").customer.organizationNumber,"");
const pdfSource=read("lib/invoiceDraftPdf.js").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const sharp=()=>({resize(){return this},flatten(){return this},jpeg(){return this},
 async toBuffer(){return {data:Buffer.from("fake-image"),info:{width:400,height:100}}}});
const {buildInvoiceDraftPdf}=new Function("sharp","path","process","Buffer",
 pdfSource+";return {buildInvoiceDraftPdf};")(sharp,{join:()=>"/fake-logo.webp"},process,Buffer);
const pdfInvoice={id,status:"draft",title:"Utbedring",customer:{
 name:"Eksempel Firma AS",customerType:"business",organizationNumber:"987654321",
 contactPerson:"Kari Kundekontakt",address:"Fakturaveien 1",internalNote:"HEMMELIG_01234"
},line_items:[{description:"Tjenester",quantity:1,unit:"stk",unitPriceOre:50000,vatRate:25}]};
const pdf=(await buildInvoiceDraftPdf(pdfInvoice)).toString("latin1");
assert.ok(pdf.includes("Org.nr.: 987654321"));
assert.ok(pdf.includes("Kontaktperson: Kari Kundekontakt"));
assert.ok(!pdf.includes("HEMMELIG_01234"));
const privatePdf=(await buildInvoiceDraftPdf({...pdfInvoice,customer:{
 ...pdfInvoice.customer,customerType:"private",organizationNumber:"",contactPerson:"FEIL_VISNING"
}})).toString("latin1");
assert.ok(!privatePdf.includes("FEIL_VISNING"));
const preview=read("app/admin/faktura/InvoicesClient.js");
assert.ok(preview.includes("Kontaktperson: {invoice.customer.contactPerson}"));
const planSql=read("supabase/migrations/20261021132948_invoice_payment_plan_drafts.sql");
assert.ok(planSql.includes("q.customer||jsonb_build_object"),"Accepted quotes retain their existing customer snapshot");
console.log("Bedriftskunde tilbud–faktura bestått: kunde-ID, org.nr., kontaktperson, oppdatert kundekort, PDF og personvern.");
