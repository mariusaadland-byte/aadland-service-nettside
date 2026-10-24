import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// All provider/database operations are mocked: no real money movement or email.
const pdfRaw=readFileSync("lib/invoicePaymentStatementPdf.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const fakeSharp=()=>({resize(){return this;},flatten(){return this;},jpeg(){return this;},
 async toBuffer(){return {data:Buffer.from("mock-image"),info:{width:400,height:100}};}});
const buildPdf=new Function("sharp","path",pdfRaw+";return buildInvoicePaymentStatementPdf;")(
 fakeSharp,{join:()=>"/mock/logo.webp"}
);
const invoiceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0097",docId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0097";
const snapshot={
 invoiceId,invoiceNumber:"AS-WEB-2026-002345",invoiceDate:"2026-10-24",
 asOfDate:"2026-10-24",dueDate:"2026-11-06",title:"Kjøkkensnekker",
 customer:{name:"Testkunden",email:"test@example.invalid",address:"Testgaten 1"},
 grossOre:200000,creditedOre:25000,paidOre:125000,outstandingOre:50000,
 activeVipps:0,
 payments:[
  {id:"p1",paidOn:"2026-10-21",method:"manual",amountOre:50000,note:"Bankoverføring"},
  {id:"p2",paidOn:"2026-10-22",method:"vipps",amountOre:75000,note:""}
 ],
 credits:[{number:"AS-KN-2026-000100",date:"2026-10-23",amountOre:25000}],
 refunds:[{reference:"INV-TEST-1",capturedOre:100000,refundedOre:25000}]
};
const pdf=(await buildPdf(snapshot)).toString("latin1");
assert.ok(pdf.startsWith("%PDF-1.4"));
for(const value of ["BETALINGSOVERSIKT","AS-WEB-2026-002345","REGISTRERTE INNBETALINGER",
 "500,00 kr","1 250,00 kr","500,00 kr","250,00 kr","AS-KN-2026-000100",
 "Betalingsreferanse: INV-TEST-1","Refusjonene er allerede","Bank / manuelt","Vipps"]){
 assert.ok(pdf.includes(value),"Missing PDF detail: "+value);
}
assert.ok(!pdf.includes("Kontonummer:"),"Statement is not a payment request");
assert.ok(!pdf.includes("GJENSTÅR 0,00"));
const fully={...snapshot,paidOre:175000,outstandingOre:0,
 payments:[...snapshot.payments,{id:"p3",paidOn:"2026-10-24",method:"manual",amountOre:50000,note:""}]};
const paidPdf=(await buildPdf(fully)).toString("latin1");
assert.ok(paidPdf.includes("FAKTURAEN ER OPPGJORT"));
assert.ok(!paidPdf.includes("Gjenstående fakturakrav"),"Fully paid document must not display a zero remaining balance");
await assert.rejects(buildPdf({...snapshot,outstandingOre:49999}),/stemmer ikke/);
const large={...snapshot,payments:Array.from({length:60},(_,i)=>({
 id:"long-"+i,paidOn:"2026-10-24",method:"manual",amountOre:1,note:""
}))};
const many=await buildPdf(large);
const multi=many.toString("latin1");
assert.ok((multi.match(/\/Type \/Page\b/g)||[]).length>2,"Payment details must paginate");
assert.ok((multi.match(/Side /g)||[]).length>2,"Every PDF page must have a page number");

let statement={
 id:docId,invoice_id:invoiceId,snapshot:{...snapshot},pdf_base64:null,
 first_send_at:null,sent_at:null,resend_id:null,delivery_error:null
};
let rpcCalls=0,failSend=false,letters=[];
const db={
 async rpc(name,args){
  rpcCalls++;assert.equal(name,"issue_invoice_payment_statement");
  assert.equal(args.p_invoice_id,invoiceId);assert.equal(args.p_expected_paid_ore,125000);
  assert.equal(args.p_expected_credited_ore,25000);assert.equal(args.p_expected_outstanding_ore,50000);
  return {data:{...statement},error:null};
 },
 from(table){
  assert.equal(table,"invoice_payment_statements");
  const q={
   patch:null,filters:[],select(){return q;},
   update(value){q.patch=value;return q;},eq(k,v){q.filters.push([k,v]);return q;},
   is(k,v){q.filters.push([k,v]);return q;},
   async single(){return {data:{...statement},error:null}},
   then(resolve,reject){
    if(q.patch&&q.filters.every(([k,v])=>v===null?statement[k]===null||statement[k]===undefined:statement[k]===v))
     Object.assign(statement,q.patch);
    return Promise.resolve({error:null}).then(resolve,reject);
   }
  };return q;
 }
};
class FakeResend{
 constructor(){this.emails={send:async(mail,options)=>{
  letters.push({mail,options});
  if(failSend)return {error:{message:"Temporary mail failure"}};
  return {data:{id:"resend-test"}};
 }};}
}
const deliveryRaw=readFileSync("lib/invoicePaymentStatementDelivery.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"")
 .replace('const {Resend}=await import("resend");','const Resend=FakeResend;');
const delivery=new Function("buildInvoicePaymentStatementPdf","FakeResend","process",
 deliveryRaw+";return {saveInvoicePaymentStatementPdf,sendInvoicePaymentStatement};")(
 buildPdf,FakeResend,{env:{VERCEL_ENV:"production",RESEND_API_KEY:"fake-only"}}
);
const params={invoiceId,expectedPaidOre:125000,expectedCreditedOre:25000,
 expectedOutstandingOre:50000,expectedEmail:"test@example.invalid"};
failSend=true;
await assert.rejects(delivery.sendInvoicePaymentStatement(db,params),/Temporary mail failure/);
assert.ok(statement.pdf_base64?.startsWith("JVBERi0xLjQ"));
const originalPdf=statement.pdf_base64;
assert.ok(statement.first_send_at,"Stable first-send timestamp is persisted");
failSend=false;
let result=await delivery.sendInvoicePaymentStatement(db,params);
assert.equal(result.sent,true);
assert.equal(letters.length,2);
assert.equal(letters[0].options.idempotencyKey,"invoice-payment-statement/"+docId);
assert.equal(letters[0].options.idempotencyKey,letters[1].options.idempotencyKey);
assert.equal(letters[1].mail.attachments[0].content,originalPdf);
assert.match(letters[1].mail.text,/Gjenstående beløp per oversiktsdato/);
assert.match(letters[1].mail.text,/ikke en ny faktura/);
assert.equal(statement.sent_at!==null,true);
result=await delivery.sendInvoicePaymentStatement(db,params);
assert.equal(result.alreadySent,true);
assert.equal(letters.length,2,"Same statement may not be emailed twice");
statement={...statement,id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0098",pdf_base64:null,
 first_send_at:new Date(Date.now()-25*3600000).toISOString(),sent_at:null};
await assert.rejects(delivery.sendInvoicePaymentStatement(db,params),/sendeloggen/);
assert.equal(letters.length,2);
statement={...statement,id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0099",pdf_base64:null,
 first_send_at:null,sent_at:null};
await assert.rejects(delivery.sendInvoicePaymentStatement(db,{...params,expectedEmail:"other@example.invalid"}),/e-postadresse er endret/);
assert.equal(letters.length,2);
const ui=readFileSync("app/admin/faktura/InvoicePaymentStatementPanel.js","utf8");
const api=readFileSync("app/api/admin/invoices/payment-statements/route.js","utf8");
const client=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
const sql=readFileSync("supabase/migrations/20261024181500_invoice_payment_statements.sql","utf8");
assert.ok(ui.includes("Send samlet oversikt på e-post"));
assert.ok(ui.includes("expectedOutstandingOre:amounts.outstanding"));
assert.ok(client.includes("<InvoicePaymentStatementPanel"));
assert.ok(api.includes("sameOriginGuard(req)")&&api.includes('user?.role!=="owner"'));
assert.ok(api.includes("preview_invoice_payment_statement"));
assert.ok(api.includes("mode")&&api.includes("history"));
assert.ok(sql.includes("for update")&&sql.includes("payment_total<>i.paid_ore"));
assert.ok(sql.includes("vipps_net<>")&&sql.includes("credited_ore"));
assert.ok(sql.includes("unique(invoice_id,fingerprint)"));
assert.ok(sql.includes("enable row level security"));
console.log("Samlet betalingsoversikt bestått: flere delbetalinger, kreditnota, refundering, fler-siders PDF, saldo, eierkontroll og idempotent e-post.");
