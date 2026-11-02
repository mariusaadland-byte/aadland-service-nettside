import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const helperSource=readFileSync("lib/invoiceFriendlyReminder.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const invoicePaymentState=invoice=>({outstanding:Math.max(0,10000-Number(invoice.paid_ore||0))});
const {friendlyReminderEligible,friendlyReminderText}=new Function("invoicePaymentState",
 helperSource+";return {friendlyReminderEligible,friendlyReminderText};")(invoicePaymentState);
const invoice={
 id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0011",invoice_number:"AS-TEST-111",
 status:"sent",due_date:"2026-10-01",paid_ore:0,credited_ore:0,
 pdf_base64:"UERG",customer:{email:"test@example.invalid",name:"Demo"},
 line_items:[{quantity:1,unitPriceOre:8000,vatRate:25}],title:"Demo"
};
assert.equal(friendlyReminderEligible(invoice,"2026-11-02"),true);
assert.equal(friendlyReminderEligible({...invoice,status:"draft"},"2026-11-02"),false);
const wording=friendlyReminderText(invoice,10000);
assert.match(wording.body,/01\.10\.2026/);
assert.match(wording.body,/Opprinnelig forfallsdato/);
assert.match(wording.body,/ingen ny betalingsfrist/i);
assert.ok(!/Ny betalingsfrist:\s*\d/.test(wording.body));
assert.ok(!/purregebyr:\s*\d/i.test(wording.body));

const rows=[],requests=[],originalDue=invoice.due_date;
let deliveries=0,role="owner",env="production";
const recipients=[];
class Query{
 constructor(table){this.table=table;this.filters=[];this.kind="select";}
 select(){return this;}
 eq(key,value){this.filters.push([key,value]);return this;}
 is(key,value){this.filters.push([key,value]);return this;}
 order(){return this;}
 insert(value){this.kind="insert";this.value=value;return this;}
 update(value){this.kind="update";this.value=value;return this;}
 async maybeSingle(){return this.result(true);}
 async single(){return this.result(true);}
 limit(){return this.result(false);}
 then(resolve,reject){return this.result(false).then(resolve,reject);}
 matches(row){return this.filters.every(([key,value])=>(row[key]??null)===value);}
 async result(single){
  if(this.table==="invoice_drafts"){
   assert.equal(this.kind,"select");return {data:invoice,error:null};
  }
  if(this.table==="invoice_vipps_payments"||this.table==="invoice_credit_notes")
   return {data:[],error:null};
  assert.equal(this.table,"invoice_friendly_reminders");
  if(this.kind==="insert"){
   if(rows.some(x=>x.id===this.value.id))return {data:null,error:{message:"duplicate"}};
   const row={...this.value,created_at:"2026-11-02T10:00:00Z",
    first_send_at:null,sent_at:null,error_message:null,resend_id:null};
   rows.push(row);return {data:row,error:null};
  }
  if(this.kind==="update"){
   const row=rows.find(x=>this.matches(x));
   if(row)Object.assign(row,this.value);
   return {data:null,error:null};
  }
  const found=rows.filter(row=>this.matches(row));
  return {data:single?(found[0]||null):found,error:null};
 }
}
const db=()=>({from:table=>new Query(table)});
const FakeResend=class{
 constructor(key){assert.equal(key,"fake-test-key");this.emails={
  send:async(message,opts)=>{
   deliveries++;requests.push({message,opts});
   recipients.push(message.to);
   return {data:{id:"provider-"+deliveries},error:null};
  }
 };}
};
const routeSource=readFileSync("app/api/admin/invoices/friendly-reminders/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ")
 .replace('const {Resend}=await import("resend");',"const Resend=FakeResend;");
const NextResponse={json:(data,opts={})=>({data,status:opts.status||200,headers:opts.headers||{}})};
const {GET,POST}=new Function("getAdminUser","db","sameOriginGuard","osloDateKey","invoicePaymentState",
 "invoiceSettlementInfo","summarizeInvoiceActivity","friendlyReminderEligible","friendlyReminderText",
 "NextResponse","FakeResend","process",routeSource+";return {GET,POST};")(
 async()=>({role,id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}),db,()=>null,()=> "2026-11-02",
 invoicePaymentState,()=>({needsReview:false}),invoices=>invoices,
 friendlyReminderEligible,friendlyReminderText,NextResponse,FakeResend,
 {env:{VERCEL_ENV:"production",RESEND_API_KEY:"fake-test-key"}}
);
const requestId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const makeRequest=(id=requestId,amount=10000)=>({
 json:async()=>({invoiceId:invoice.id,requestId:id,confirmed:true,
  expectedEmail:"test@example.invalid",expectedOutstandingOre:amount})
});
let sent=await POST(makeRequest());
assert.equal(sent.status,200);
assert.equal(deliveries,1);
assert.equal(sent.data.to,"test@example.invalid");
assert.equal(rows.length,1);
assert.equal(rows[0].original_due_date,originalDue);
assert.equal(invoice.due_date,originalDue);
assert.equal(requests[0].message.attachments.length,1,"Original PDF only");
assert.equal(requests[0].message.attachments[0].content,invoice.pdf_base64);
assert.ok(!/purring/i.test(requests[0].message.subject));
assert.ok(requests[0].message.text.includes("Opprinnelig forfallsdato"));
assert.equal(requests[0].opts.idempotencyKey,"invoice-friendly-reminder/"+requestId);
sent=await POST(makeRequest());
assert.equal(sent.data.alreadySent,true);
assert.equal(deliveries,1,"Retry with same request ID must not send again");
sent=await POST(makeRequest("dddddddd-dddd-4ddd-8ddd-dddddddddddd"));
assert.equal(sent.status,200);
assert.equal(deliveries,2,"A new explicit reminder is permitted");
const history=await GET({url:"https://localhost/api/admin/invoices/friendly-reminders?invoiceId="+invoice.id});
assert.equal(history.status,200);assert.equal(history.data.reminders.length,2);
assert.ok(!JSON.stringify(history.data).includes("UERG"),"History never contains invoice PDF");
sent=await POST(makeRequest("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",9900));
assert.equal(sent.status,409);assert.equal(deliveries,2,"Stale amount never sends");
invoice.paid_ore=10000;
sent=await POST(makeRequest("ffffffff-ffff-4fff-8fff-ffffffffffff",10000));
assert.equal(sent.status,409);assert.equal(deliveries,2,"Fully paid invoice never sends");
assert.equal(rows.length,2);
assert.deepEqual(recipients,["test@example.invalid","test@example.invalid"]);
role="none";
sent=await POST(makeRequest());
assert.equal(sent.status,403);
console.log("Vennlige fakturapåminnelser bestått: original forfall/PDF, beløpskontroll, rettigheter, historikk og gjentakelse uten dobbeltsending.");
