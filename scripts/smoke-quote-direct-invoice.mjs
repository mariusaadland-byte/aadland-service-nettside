import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("app/api/admin/quotes/direct-invoice/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export const runtime=.*;\n/gm,"")
 .replace("export async function POST","async function POST");
const quoteId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const contactId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const quote={id:quoteId,status:"draft",title:"Arbeid og materialer",quote_number:"AS-T-1",intro_text:"Avtalt arbeid",notes:"",customer:{contactId},line_items:[
 {id:"w",type:"work",quantity:2,description:"Tømrerarbeid",unit:"time",unitPriceOre:65000,vatRate:25},
 {id:"m",type:"material",quantity:1,description:"Materialer",unit:"stk",unitPriceOre:10000,vatRate:25}
],total_inc_vat_ore:175000};
const contact={id:contactId,name:"Eksempelkunde",email:"kunde@example.invalid",phone:"12345678",address:"Gate 1, 5000 Bergen",payment_terms_days:30};
const options={__directInvoice:true,__skipQuoteApproval:true};
const invoices=[];
const s={from(table){
 const filters=[];
 const q={
  select(){return q},
  eq(k,v){filters.push(x=>x[k]===v);return q},
  async maybeSingle(){
   const data=table==="quotes"?[quote]:table==="quote_internal_costs"?[{quote_id:quoteId,line_costs:options}]:
    table==="admin_customer_contacts"?[contact]:table==="invoice_drafts"?invoices:[];
   return {data:data.find(x=>filters.every(p=>p(x)))||null,error:null};
  },
  insert(payload){assert.equal(table,"invoice_drafts");return {select(){return {async single(){const row={...payload,id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"};invoices.push(row);return {data:row,error:null}}}}};}
 };
 return q;
}};
const api=new Function("NextResponse","sameOriginGuard","getAdminUser","db",
 source+";return {POST};")(
 {json(body,params={}){return {body,status:params.status||200}}},
 ()=>null,async()=>({role:"owner"}),()=>s
);
const call=(paymentMethod="vipps")=>api.POST({json:async()=>({quoteId,paymentMethod})});
let result=await call();
assert.equal(result.status,201);
assert.equal(invoices.length,1);
assert.equal(invoices[0].source_quote_id,quoteId);
assert.equal(invoices[0].status,"draft","Do not issue or send invoice");
assert.equal(invoices[0].customer.paymentMethod,"vipps");
assert.equal(invoices[0].customer.paymentTermsDays,30,"Respect customer card");
assert.equal(invoices[0].customer.workDescription,quote.title,"Use a work description instead of offer introduction");
assert.ok(!invoices[0].notes.includes("uten egen tilbudsgodkjenning"),"Never expose internal approval state in customer invoice notes");
assert.equal(invoices[0].line_items[0].unitPriceOre,65000,"Hourly price unchanged");
assert.equal(invoices[0].line_items[1].unitPriceOre,10000);
assert.equal(invoices[0].installment_index,0);
result=await call("bank");
assert.equal(result.status,200);
assert.equal(result.body.existing,true);
assert.equal(invoices.length,1,"Repeated request must not create duplicate invoice");
options.__skipQuoteApproval=false;
result=await call();assert.equal(result.status,400,"Do not bypass customer approval without checkbox");
options.__skipQuoteApproval=true;
invoices.length=0;contact.address=null;
result=await call();assert.equal(result.status,400,"Require customer billing address");
contact.address="Gate 1, 5000 Bergen";
quote.customer.contactId="";
result=await call();assert.equal(result.status,400,"Require registered customer");
quote.customer.contactId=contactId;
quote.total_inc_vat_ore=1;
result=await call();assert.equal(result.status,409,"Reject unsaved price changes");
const editor=readFileSync("app/admin/tilbud/QuoteEditorClient.js","utf8");
const picker=readFileSync("app/admin/tilbud/QuoteCustomerPicker.js","utf8");
const invoiceEditor=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
assert.ok(editor.includes("FAKTURER DIREKTE"),"Direct billing panel is present");
assert.ok(editor.indexOf("FAKTURER DIREKTE")>editor.indexOf('className="quoteSummaryPlan"'),"Fakturer panel must be AFTER quote totals at the bottom");
assert.ok(editor.indexOf("FAKTURER DIREKTE")>editor.indexOf('className="quoteEditorHeaderActions"'),"Fakturer must not appear in header");
assert.ok(!editor.includes("invoiceMode"),"Payment choice must share the saved quote pricing method");
assert.ok(editor.includes('onChange={e=>set("pricingPaymentMethod",e.target.value)}'),"Payment selection must persist in quote state");
assert.ok(editor.includes("QuoteCustomerPicker"),"Customer form replaced with central customer search");
assert.ok(picker.includes("normalize(search)?contacts.filter"),"Do not render unsolicited 30-customer list");
assert.ok(picker.includes("Hent siste endringer"),"Allow refreshing customer details from linked card");
assert.ok(invoiceEditor.includes('window.confirm("Sende faktura"'),"Require confirmation before sending invoice email");
console.log("Direkte faktura bestått: avkrysning, kundekort, betalingsfrist, timepris, totalpris, én kladd og gjenbruk ved nytt klikk.");
