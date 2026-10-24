import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Fully mocked: never talks to Vipps, Resend, customers, or a database.
const source=readFileSync("lib/invoiceVippsRefundNotice.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"")
 .replace('const {Resend}=await import("resend");','const Resend=FakeResend;');
const sql=readFileSync("supabase/migrations/20261024103000_invoice_vipps_refund_notices.sql","utf8");
assert.match(sql,/new.refunded_ore > old.refunded_ore/,"Only a real confirmed refund creates a notice");
assert.match(sql,/unique\(payment_id,refunded_total_ore\)/,"Cumulative refund is uniquely tracked");
assert.match(sql,/for update skip locked/,"Concurrent email jobs claim only one row");
assert.match(sql,/enable row level security/,"No anonymous refund-notice access");
const payment={id:"payment-1",invoice_id:"invoice-1",reference:"INV-12345678-1234-4234-8234-123456789abc",
 captured_ore:12500,refunded_ore:5000};
const invoice={id:"invoice-1",invoice_number:"AS-WEB-TEST",customer:{name:"Ola & Kari",email:"kunde@example.no"}};
let notice={id:"notice-1",payment_id:"payment-1",invoice_id:"invoice-1",
 refunded_delta_ore:5000,refunded_total_ore:5000,status:"pending",sent_at:null};
const sends=[],failed=[];
let failSend=false;
class FakeResend{
 constructor(){this.emails={send:async(message,opts)=>{
  if(failSend)return {error:{message:"Transient Resend error"}};
  sends.push({message,opts});return {data:{id:"mock-email"}};
 }};}
}
function mockDb(){
 return {
  async rpc(name,args){
   assert.equal(name,"claim_invoice_vipps_refund_notice");
   assert.equal(args.p_payment_id,"payment-1");
   if(notice.status==="sent"||notice.status==="sending")return {data:null,error:null};
   notice={...notice,status:"sending",first_send_at:notice.first_send_at||new Date().toISOString()};
   return {data:{...notice},error:null};
  },
  from(table){
   let target=table==="invoice_drafts"?invoice:table==="invoice_vipps_payments"?payment:notice;
   let patch=null;
   const q={
    select(){return q;},eq(){return q;},update(values){patch=values;return q;},
    async single(){return {data:{...target},error:null}},
    then(resolve,reject){
     if(patch){if(table!=="invoice_vipps_refund_notices")throw Error("Wrong update table");Object.assign(notice,patch);if(patch.status==="failed")failed.push(patch); }
     return Promise.resolve({error:null}).then(resolve,reject);
    }
   };
   return q;
  }
 };
}
const send=new Function("FakeResend","process",source+";return sendInvoiceVippsRefundNoticeIfNeeded;")(FakeResend,{env:{VERCEL_ENV:"production",RESEND_API_KEY:"test-key"}});
let result=await send({s:mockDb(),paymentId:"payment-1"});
assert.equal(result.sent,true);
assert.equal(result.amountOre,5000);
assert.equal(sends.length,1);
assert.match(sends[0].message.subject,/Tilbakebetaling/);
assert.match(sends[0].message.text,/ikke en kreditnota/);
assert.match(sends[0].message.text,/50,00/);
assert.match(sends[0].message.html,/Ola &amp; Kari/,"Escape HTML names");
assert.ok(!sends[0].message.html.includes("Ola & Kari"),"Never inject raw customer HTML");
assert.equal(sends[0].opts.idempotencyKey,"invoice-vipps-refund/notice-1");
assert.equal(notice.status,"sent");
result=await send({s:mockDb(),paymentId:"payment-1"});
assert.equal(result.reason,"nothing-pending");
assert.equal(sends.length,1,"No second email for same refund");
notice={...notice,id:"notice-2",refunded_delta_ore:7500,refunded_total_ore:12500,status:"pending",sent_at:null};
payment.refunded_ore=12500;
result=await send({s:mockDb(),paymentId:"payment-1"});
assert.equal(result.sent,true);
assert.equal(result.amountOre,7500);
assert.equal(sends.length,2);
assert.match(sends[1].message.text,/125,00/,"Total refunded shown");
assert.match(sends[1].message.text,/0,00/,"No Vipps funds remain");
assert.notEqual(sends[0].opts.idempotencyKey,sends[1].opts.idempotencyKey);
notice={...notice,id:"notice-3",status:"pending",sent_at:null,refunded_delta_ore:2500,refunded_total_ore:15000};
await assert.rejects(send({s:mockDb(),paymentId:"payment-1"}),/ennå ikke bekreftet/);
assert.equal(sends.length,2,"Unconfirmed refunds must never send email");
assert.equal(notice.status,"failed");
notice={...notice,id:"notice-4",status:"pending",sent_at:null,refunded_delta_ore:100,refunded_total_ore:12500};
failSend=true;
await assert.rejects(send({s:mockDb(),paymentId:"payment-1"}),/Transient/);
assert.equal(notice.status,"failed");
const firstId="invoice-vipps-refund/notice-4";
failSend=false;
await send({s:mockDb(),paymentId:"payment-1"});
assert.equal(sends[2].opts.idempotencyKey,firstId,"Retries reuse same Resend key");
assert.equal(failed.length,2);
console.log("Faktura Vipps-refusjonsbekreftelse bestått: kø, e-post, escaping, del-/helrefusjon, retry med samme nøkkel og ingen ekte sending.");
