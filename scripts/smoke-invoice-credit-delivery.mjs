import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Isolated mail/delivery simulation: no real email, customer or Supabase access.
let note={
 id:"credit-test-1",credit_number:"AS-KN-2026-000001",
 original_invoice_number:"AS-WEB-2026-000002",reason:"Price correction",
 total_ore:62500,pdf_base64:"base64-test-pdf",
 customer:{name:"Test Customer",email:"test@example.invalid"},
 first_send_at:null,sent_at:null,delivery_error:null
};
let sendCount=0,failOnce=false;
const mails=[];
class FakeResend{
 constructor(){this.emails={send:async(payload,options)=>{
  sendCount++;mails.push({payload,options});
  if(failOnce){failOnce=false;return {error:{message:"temporary unavailable"}};}
  return {data:{id:"resend-test-id"}};
 }};}
}
const calls=[];
const db={
 from(name){
  assert.equal(name,"invoice_credit_notes");
  let value=null,filters=[];
  const q={
   update(v){value=v;return q;},eq(k,v){filters.push([k,v]);return q;},
   is(k,v){filters.push([k,v]);return q;},
   select(){return q;},
   async single(){return {data:{...note},error:null}},
   then(resolve,reject){
    if(value){
     if(filters.every(([key,x])=>x===null?note[key]===null||note[key]===undefined:note[key]===x)){
      Object.assign(note,value);
      calls.push({...value});
     }
    }
    return Promise.resolve({data:{...note},error:null}).then(resolve,reject);
   }
  };
  return q;
 }
};
const source=readFileSync("lib/invoiceCreditDelivery.js","utf8")
 .replace(/^import .*;\n/gm,"")
 .replace('const {Resend}=await import("resend");','const Resend=FakeResend;')
 .replace(/^export /gm,"");
const send=new Function("FakeResend","freezeInvoiceCreditPdf","process",
 source+";return sendInvoiceCreditNote;")(FakeResend,async(s,n)=>n,
 {env:{VERCEL_ENV:"production",RESEND_API_KEY:"only-mock"}});
let r=await send(db,{...note});
assert.equal(r.sent,true);
assert.equal(sendCount,1);
assert.equal(note.resend_id,"resend-test-id");
assert.equal(note.sent_at!==null,true);
assert.equal(mails[0].payload.to,"test@example.invalid");
assert.match(mails[0].payload.subject,/Kreditnota AS-KN-2026-000001/);
assert.match(mails[0].payload.text,/ikke et nytt betalingskrav/i);
assert.equal(mails[0].payload.attachments[0].content,"base64-test-pdf");
assert.equal(mails[0].payload.attachments[0].contentType,"application/pdf");
assert.equal(mails[0].options.idempotencyKey,"invoice-credit-note/credit-test-1");
r=await send(db,{...note});
assert.equal(r.alreadySent,true);
assert.equal(sendCount,1,"Previously sent credit notes never send again");
note={...note,id:"credit-test-2",credit_number:"AS-KN-2026-000002",first_send_at:null,sent_at:null};
failOnce=true;
await assert.rejects(send(db,{...note}),/temporary unavailable/);
assert.equal(note.delivery_error,"temporary unavailable");
assert.equal(sendCount,2);
assert.ok(note.first_send_at,"A failed send keeps the original first-send timestamp");
await send(db,{...note});
assert.equal(sendCount,3);
assert.equal(mails[1].options.idempotencyKey,mails[2].options.idempotencyKey,
 "Retries reuse the same provider idempotency key");
note={...note,id:"credit-test-3",sent_at:null,first_send_at:new Date(Date.now()-25*3600000).toISOString()};
await assert.rejects(send(db,{...note}),/23 timer/);
assert.equal(sendCount,3,"Unverified old sends are blocked");
console.log("Kreditnota e-post bestått: PDF-vedlegg, mottaker, samme utsendingsnøkkel, retry og 23-timersperre; ingen ekte e-post.");
