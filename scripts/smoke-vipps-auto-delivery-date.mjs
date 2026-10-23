import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const dateSource=readFileSync("lib/invoiceVippsDate.js","utf8").replace(/^export /gm,"");
const {vippsDeliveryDate,withVippsDeliveryDate}=new Function(dateSource+";return {vippsDeliveryDate,withVippsDeliveryDate};")();
const today="2026-10-23";
const auto={id:"a",status:"draft",customer:{name:"Vippskunde",paymentMethod:"vipps",workDate:"",workDescription:"Dagens jobb"}};
const oldDate={...auto,customer:{...auto.customer,workDate:"2026-10-21"}};
const bank={...auto,customer:{...auto.customer,paymentMethod:"bank",workDate:"2026-10-21"}};
assert.equal(vippsDeliveryDate(auto,today),today);
assert.equal(vippsDeliveryDate(oldDate,today),today,"A Vipps job uses delivery date of the invoice issue day");
assert.equal(withVippsDeliveryDate(auto,today).customer.workDate,today);
assert.equal(withVippsDeliveryDate(oldDate,today).customer.workDate,today);
assert.equal(withVippsDeliveryDate(bank,today),bank,"Ordinary bank invoices retain explicitly chosen actual delivery date");
assert.equal(withVippsDeliveryDate({...auto,status:"issued"},today).customer.workDate,"","Previously issued invoices never mutate");
assert.equal(auto.customer.workDate,"","Never mutate fetched invoice in-place");

const termsSrc=readFileSync("lib/invoicePaymentTerms.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {withInvoicePaymentTerms}=new Function("withVippsDeliveryDate",termsSrc+";return {withInvoicePaymentTerms};")(withVippsDeliveryDate);
const loaded=withInvoicePaymentTerms({...auto,due_date_mode:"auto"},[{id:"one",email:"",payment_terms_days:14}],today);
assert.equal(loaded.customer.workDate,today,"On opening a Vipps draft, date should already be visible");
assert.equal(loaded.due_date,"2026-11-06");
const manual=withInvoicePaymentTerms({...bank,due_date:"2026-12-01",due_date_mode:"manual"},[],today);
assert.equal(manual.customer.workDate,"2026-10-21");
assert.equal(manual.due_date,"2026-12-01");

const src=readFileSync("app/api/admin/invoices/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replaceAll("export async function ","async function ");
const record={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",status:"draft",updated_at:"2026-10-23T14:00:00.000Z"};
const contact={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"Kunde",email:"test@example.invalid",payment_terms_days:14,preferred_payment_method:"vipps"};
let write=null;
const db=()=>({from(table){let val=null;const q={
 select(){return q},eq(){return q},update(x){assert.equal(table,"invoice_drafts");val=x;return q},
 async maybeSingle(){if(table==="admin_customer_contacts")return {data:contact,error:null};write=val;return {data:{id:record.id,updated_at:"2026-10-23T14:01:00.000Z"},error:null};}
 };return q;}});
const PATCH=new Function("NextResponse","getAdminUser","db","sameOriginGuard","withInvoicePaymentTerms","osloDateKey",
 src+";return PATCH;")(
 {json:(body,{status=200}={})=>({body,status})},async()=>({role:"owner"}),db,()=>null,()=>{},()=>today
);
function payload(paymentMethod){
 return {id:record.id,expectedUpdatedAt:record.updated_at,
  customer:{name:"Kunde",contactId:contact.id,workDate:"",workDescription:"Utført arbeid",paymentMethod},
  title:"Jobb",pricingModel:"fixed",lineItems:[{description:"Arbeid",type:"work",quantity:1,unit:"stk",unitPriceOre:80,vatRate:25}],
  dueDateMode:"auto",dueDate:"2026-11-06"};
}
let result=await PATCH({json:async()=>payload("vipps")});
assert.equal(result.status,200);
assert.equal(write.customer.workDate,today,"Server must save today's delivery date for Vipps, even if form is blank");
assert.equal(write.customer.workDescription,"Utført arbeid","Do not overwrite job details");
assert.equal(write.customer.email,"test@example.invalid");
result=await PATCH({json:async()=>({...payload("bank"),customer:{...payload("bank").customer,workDate:"2026-10-20"}})});
assert.equal(result.status,200);
assert.equal(write.customer.workDate,"2026-10-20","Bank jobs preserve actual service date");

const sql=readFileSync("supabase/migrations/20261023183100_vipps_delivery_day_auto.sql","utf8");
assert.ok(sql.includes("CREATE OR REPLACE FUNCTION public.issue_invoice_draft"));
assert.ok(sql.includes("today=(now() at time zone 'Europe/Oslo')::date"));
assert.ok(sql.includes("if i.customer->>'paymentMethod'='vipps' then"));
assert.ok(sql.includes("i.customer:=i.customer||jsonb_build_object('workDate',today::text)"));
assert.ok(sql.includes("i.updated_at is distinct from p_expected_updated_at"),"Preserve concurrency guard");
assert.ok(sql.includes("update public.invoice_drafts set due_date=i.due_date,customer=i.customer"),"Actually save the auto-date when issuing");
assert.ok(sql.includes("if i.status<>'draft' then return to_jsonb(i); end if"),"Never change issued invoices");
assert.ok(sql.includes("insert into public.invoice_number_counters"),"Preserve invoice numbering");
const editor=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
assert.ok(editor.includes('form.customer?.paymentMethod==="vipps"'),"Vipps date field is replaced by a fixed date");
assert.ok(editor.includes("Leveringsdato: {today}"));
assert.ok(editor.includes("Leveringsdato / avtalt leveringsdato"),"Bank invoices retain manual date selection");
assert.ok(editor.includes("onPaymentMethodChange={method=>change"));
assert.ok(editor.includes('workDate:method==="vipps"?today:'),"Switching to Vipps immediately sets today's date");
const vipps=readFileSync("lib/invoiceVipps.js","utf8");
assert.ok(vipps.includes("if(autoDate)confirmation={...confirmation"),"Handle Oslo midnight between confirmation and issue");
assert.ok(vipps.includes('s.rpc("issue_invoice_draft"'),"Still issue atomically via existing production RPC");
console.log("Vipps-leveringsdato bestått: dato automatisk fra Oslo ved valg, kladdlagring og utstedelse; bankdato, bekreftelse og utstedte fakturaer bevart.");
