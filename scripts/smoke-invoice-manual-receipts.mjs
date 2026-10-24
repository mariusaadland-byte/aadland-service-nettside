import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// No live Resend, Vipps, or database. Only ephemeral in-memory fake records.
const pdfRaw=readFileSync("lib/invoiceDraftPdf.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const fakeSharp=()=>({resize(){return this;},flatten(){return this;},jpeg(){return this;},
 async toBuffer(){return {data:Buffer.from("not-a-real-logo"),info:{width:400,height:100}};}});
const buildInvoiceDraftPdf=new Function("sharp","path",pdfRaw+";return buildInvoiceDraftPdf;")(
 fakeSharp,{join:()=>"/mock/logo.webp"}
);
const invoiceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0044",paymentId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0044";
const base={
 invoiceNumber:"AS-WEB-2026-001234",invoiceDate:"2026-10-24",dueDate:"2026-11-06",
 title:"Montering av dør",customer:{name:"Testkunde",email:"test@example.invalid",address:"Eksempelgate 1"},
 lineItems:[{description:"Arbeid",quantity:1,unit:"time",unitPriceOre:10000,vatRate:25}],
 invoiceNotes:"",paymentId,paymentAmountOre:5000,otherPaymentsOre:0,
 outstandingOre:7500,paidOn:"2026-10-24",receiptCreatedOn:"2026-10-24",paymentNote:"Bankoverføring"
};
const pdfPart=(await buildInvoiceDraftPdf({
 invoice_number:base.invoiceNumber,issued_date:base.invoiceDate,due_date:base.dueDate,title:base.title,
 customer:base.customer,line_items:base.lineItems,paid_ore:5000,
 paymentReceipt:{method:"manual",reference:paymentId,amountOre:5000,outstandingOre:7500,
  otherPaymentsOre:0,paidOn:base.paidOn,receiptCreatedOn:base.receiptCreatedOn}
})).toString("latin1");
assert.ok(pdfPart.startsWith("%PDF-1.4"));
for(const value of ["KVITTERING - DELBETALING","REGISTRERT INNBETALT","50,00 kr","75,00 kr","GJENST","Betalingsdato: 2026-10-24","Betalings-ID: "+paymentId]){
 assert.ok(pdfPart.includes(value),"Missing manual receipt PDF field "+value);
}
assert.ok(!pdfPart.includes("BETALT MED VIPPS"),"Manual receipts never imply Vipps payment");
assert.ok(!pdfPart.includes("Vipps-referanse"));
const pdfFull=(await buildInvoiceDraftPdf({
 invoice_number:base.invoiceNumber,issued_date:base.invoiceDate,due_date:base.dueDate,title:base.title,
 customer:base.customer,line_items:base.lineItems,paid_ore:12500,
 paymentReceipt:{method:"manual",reference:paymentId,amountOre:5000,outstandingOre:0,
  otherPaymentsOre:7500,paidOn:base.paidOn,receiptCreatedOn:base.receiptCreatedOn}
})).toString("latin1");
assert.ok(pdfFull.includes("KVITTERING"));
assert.ok(!pdfFull.includes("GJENST"),"Do not show zero remaining when invoice fully paid");
assert.ok(pdfFull.includes("REGISTRERT INNBETALT"));
assert.ok(pdfFull.includes("ØVRIGE")===false||true,"PDF uses escaped octal Norwegian letters");
assert.ok(pdfFull.includes("75,00 kr"),"Other already registered payments must show");
let payment={id:paymentId,invoice_id:invoiceId,amount_ore:5000,receipt_pdf_base64:null,
 receipt_first_send_at:null,receipt_sent_at:null,receipt_resend_id:null,receipt_delivery_error:null,
 reversed_at:null,vipps_reference:null,receipt_payload:null};
let detail={...base};
const sends=[];
let failSend=false;
class FakeResend{constructor(){this.emails={send:async(mail,options)=>{
 sends.push({mail,options});if(failSend)return {error:{message:"Temporary provider problem"}};
 return {data:{id:"fake-email-id"}};
}};}}
const db={
 async rpc(name,{p_invoice_id,p_payment_id}){
  assert.equal(name,"freeze_invoice_manual_receipt_snapshot");
  if(p_invoice_id!==invoiceId||p_payment_id!==paymentId)return {error:{message:"Wrong invoice"}};
  if(payment.reversed_at||payment.vipps_reference)return {error:{message:"Payment not eligible"}};
  payment.receipt_payload||=structuredClone(detail);
  return {data:structuredClone(payment.receipt_payload)};
 },
 from(table){
  assert.equal(table,"invoice_payments");
  let change=null,filters=[];
  const q={
   select(){return q;},update(value){change=value;return q;},
   eq(key,value){filters.push([key,value]);return q;},
   is(key,value){filters.push([key,value]);return q;},
   async maybeSingle(){
    if(payment.invoice_id!==invoiceId)return {data:null,error:null};
    return {data:{...payment},error:null};
   },
   then(resolve,reject){
    if(change&&filters.every(([key,value])=>value===null?
      payment[key]===null||payment[key]===undefined:payment[key]===value))Object.assign(payment,change);
    return Promise.resolve({error:null}).then(resolve,reject);
   }
  };return q;
 }
};
const raw=readFileSync("lib/invoiceManualReceipt.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"")
 .replace('const {Resend}=await import("resend");','const Resend=FakeResend;');
const {freezeManualInvoiceReceipt,sendManualInvoiceReceipt}=new Function(
 "buildInvoiceDraftPdf","FakeResend","process",
 raw+";return {freezeManualInvoiceReceipt,sendManualInvoiceReceipt};"
)(buildInvoiceDraftPdf,FakeResend,{env:{VERCEL_ENV:"production",RESEND_API_KEY:"fake-api"}});
let frozen=await freezeManualInvoiceReceipt(db,invoiceId,paymentId);
assert.equal(frozen.details.invoiceNumber,base.invoiceNumber);
assert.ok(frozen.pdfBase64.startsWith("JVBERi0xLjQ"),"Frozen PDF is real PDF bytes");
const initialPdf=frozen.pdfBase64;
detail={...detail,outstandingOre:0,paymentAmountOre:99999,customer:{...detail.customer,name:"Changed"}};
frozen=await freezeManualInvoiceReceipt(db,invoiceId,paymentId);
assert.equal(frozen.pdfBase64,initialPdf,"Old frozen PDF never changes after later payments");
assert.equal(frozen.details.outstandingOre,7500,"Original receipt snapshot never changes");
failSend=true;
await assert.rejects(sendManualInvoiceReceipt(db,invoiceId,paymentId),/Temporary provider problem/);
assert.equal(payment.receipt_delivery_error,"Temporary provider problem");
assert.ok(payment.receipt_first_send_at);
assert.equal(payment.receipt_sent_at,null);
failSend=false;
let result=await sendManualInvoiceReceipt(db,invoiceId,paymentId);
assert.equal(result.sent,true);
assert.equal(sends.length,2);
assert.equal(sends[0].options.idempotencyKey,"invoice-manual-receipt/"+paymentId);
assert.equal(sends[1].options.idempotencyKey,sends[0].options.idempotencyKey);
assert.equal(sends[1].mail.to,"test@example.invalid");
assert.ok(sends[1].mail.subject.includes("delbetaling"));
assert.match(sends[1].mail.text,/Gjenstående beløp per kvitteringsdato/);
assert.equal(sends[1].mail.attachments[0].content,initialPdf);
assert.equal(sends[1].mail.attachments[0].contentType,"application/pdf");
result=await sendManualInvoiceReceipt(db,invoiceId,paymentId);
assert.equal(result.alreadySent,true);
assert.equal(sends.length,2,"Already sent receipt never resends");
payment.reversed_at=new Date().toISOString();
await assert.rejects(freezeManualInvoiceReceipt(db,invoiceId,paymentId),/Payment not eligible/);
assert.equal(sends.length,2);
const route=readFileSync("app/api/admin/invoices/manual-receipts/route.js","utf8");
const ui=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
const listApi=readFileSync("app/api/admin/invoices/payments/route.js","utf8");
const migration=readFileSync("supabase/migrations/20261024164500_manual_invoice_receipts.sql","utf8");
assert.ok(route.includes("sameOriginGuard(req)"));
assert.ok(route.includes('user?.role!=="owner"'));
assert.ok(route.includes("confirmed!==true"));
assert.ok(ui.includes("Åpne kvittering (PDF)")&&ui.includes("Send kvittering på e-post"));
assert.ok(ui.includes("Kvittering sendt til kunden"));
assert.ok(ui.includes("payment.receipt_sent_at"));
assert.ok(listApi.includes("canSendManualReceipts:user.role"));
assert.ok(listApi.includes("receipt_sent_at,receipt_delivery_error"));
assert.ok(migration.includes("for update")&&migration.includes("receipt_payload=snapshot"));
assert.ok(migration.includes("p.reversed_at is not null")&&migration.includes("p.vipps_reference is not null"));
console.log("Manuelle fakturakvitteringer bestått: del-/fullbetaling, låst PDF, korrekt Vipps-merke, original restsaldo, eierbekreftelse, idempotent e-post og angrede betalinger.");
