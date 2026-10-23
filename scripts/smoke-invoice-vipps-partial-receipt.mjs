import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const rawPdf=readFileSync("lib/invoiceDraftPdf.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const mockSharp=()=>({
 resize(){return this;},flatten(){return this;},jpeg(){return this;},
 async toBuffer(){return {data:Buffer.from("mock-logo-jpeg"),info:{width:400,height:100}};}
});
const buildPdf=new Function("sharp","path",rawPdf+";return buildInvoiceDraftPdf;")(mockSharp,{join:()=>"/mock/logo.webp"});
const baseInvoice={
 id:"mock-invoice",invoice_number:"AS-WEB-TEST",issued_date:"2026-10-22",due_date:"2026-11-05",
 title:"Montering",status:"issued",customer:{name:"Testkunde",email:"test@example.invalid",address:"Adresse 1",workDate:"2026-10-22"},
 line_items:[{description:"Arbeid",quantity:1,unit:"time",unitPriceOre:10000,vatRate:25}],
 notes:"",pdf_base64:"frozen-original",paid_ore:0
};
const partialData={amountOre:5000,outstandingOre:7500,reference:"INV-12345678-1234-1234-1234-123456789abc",paidAt:"2026-10-22T14:00:00Z"};
const partialPdf=(await buildPdf({...baseInvoice,paymentReceipt:partialData})).toString("latin1");
assert.ok(partialPdf.includes("KVITTERING - DELBETALING"),"Partial receipt PDF title");
assert.ok(partialPdf.includes("DELBETALING REGISTRERT"),"Explicit partial payment label");
assert.ok(partialPdf.includes("Dette er en delbetaling, ikke en fullt betalt faktura."),"Warn that payment was not full");
assert.ok(partialPdf.includes("GJENSTÅR"),"Partial receipt shows outstanding amount");
const fullPdf=(await buildPdf({...baseInvoice,paymentReceipt:{...partialData,amountOre:12500,outstandingOre:0}})).toString("latin1");
const oneKrInvoice={...baseInvoice,invoice_number:"AS-WEB-2026-000002",
 title:"Test av Vipps",customer:{...baseInvoice.customer,workDate:"2026-10-23"},
 line_items:[{description:"Arbeid",quantity:1,unit:"stk",unitPriceOre:80,vatRate:25}],paid_ore:100};
const oneKrReceipt=(await buildPdf({...oneKrInvoice,paymentReceipt:{amountOre:100,outstandingOre:0,reference:"INV-12345678-1234-4234-8234-123456789abc",paidAt:"2026-10-23T21:35:19Z"}})).toString("latin1");
assert.ok(oneKrReceipt.includes("0,80 kr"),"Correct taxable subtotal for the real 1 NOK case");
assert.ok(oneKrReceipt.includes("0,20 kr"),"Correct 25 percent VAT of 0.80 NOK");
assert.ok(oneKrReceipt.includes("1,00 kr"),"Correct gross/paid amount");
assert.ok(oneKrReceipt.includes("AS-WEB-2026-000002"));
assert.ok(oneKrReceipt.includes("2026-10-23"));
assert.ok(oneKrReceipt.includes("FAKTURABEL"),"Receipt shows the original invoice gross total");
assert.ok(oneKrReceipt.includes("BETALING REGISTRERT"));
assert.ok(oneKrReceipt.includes("Dette dokumentet bekrefter registrert betaling, ikke et nytt betalingskrav."));
assert.ok(fullPdf.includes("KVITTERING"),"Full payment receipt title");
assert.ok(!fullPdf.includes("GJENSTÅR"),"Full payment receipt hides zero remaining");
assert.ok(!oneKrReceipt.includes("GJENSTÅR"),"1 NOK pilot receipt hides zero remaining");
assert.ok(!oneKrReceipt.includes("BETALT TIDLIGERE"),"1 NOK pilot receipt hides zero previous payments");
const finalInstallment=(await buildPdf({...baseInvoice,paid_ore:12500,paymentReceipt:{...partialData,amountOre:7500,outstandingOre:0}})).toString("latin1");
assert.ok(finalInstallment.includes("BETALT TIDLIGERE"),"Final installment shows real prior payments");
assert.ok(!finalInstallment.includes("GJENSTÅR"),"Final installment has no outstanding balance");
assert.ok(!fullPdf.includes("KVITTERING - DELBETALING"),"Full payment must not be mislabelled");
assert.ok(fullPdf.includes("BETALING REGISTRERT"));
assert.ok(!fullPdf.includes("Dette er en delbetaling, ikke en fullt betalt faktura."));
assert.ok(fullPdf.includes("Fakturaen er fullt oppgjort - takk for oppdraget!"));
assert.ok(partialPdf.includes("BETALT TIDLIGERE"));
assert.ok(partialPdf.includes("BETALT MED VIPPS N"));
assert.ok(partialPdf.includes("Vipps-referanse:"));
assert.ok(partialPdf.includes("Dette dokumentet bekrefter registrert betaling, ikke et nytt betalingskrav."));

const rawVipps=readFileSync("lib/invoiceVipps.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"")
 .replace('const {Resend}=await import("resend");','const Resend=FakeResend;');
const mailLog=[];
class FakeResend{
 constructor(){this.emails={send:async(payload,opts)=>{mailLog.push({payload,opts});return {data:{id:"mock-mail"}};}};}
}
const sendReceipt=new Function(
 "createVippsPayment","getVippsPayment","captureVippsPayment","vippsUnitReadiness","buildInvoiceDraftPdf",
 "invoiceTotalOre","invoiceVippsConfirmationSnapshot","FakeResend",
 rawVipps+";return sendInvoiceVippsReceipt;"
)(
 async()=>{},async()=>{},async()=>{},async()=>({ready:true}),async()=>Buffer.from("mock-receipt-pdf"),
 invoice=>invoice.line_items.reduce((sum,l)=>sum+Math.round(l.quantity*l.unitPriceOre*(1+l.vatRate/100)),0),
 ()=>({}),FakeResend
);
const fixture=paidOre=>{
 const invoice={...baseInvoice,paid_ore:paidOre};
 const payment={id:"mock-payment-"+paidOre,invoice_id:invoice.id,reference:partialData.reference,
  captured_ore:paidOre,refunded_ore:0,captured_at:partialData.paidAt,
  receipt_payload:null,receipt_first_at:null,receipt_sent_at:null,receipt_error:null};
 const db={
  from(table){
   const target=table==="invoice_drafts"?invoice:payment;let updated=null;const checks=[];
   const q={
    select(){return q;},eq(key,value){checks.push([key,value]);return q;},
    is(key,value){checks.push([key,value]);return q;},
    update(value){updated=value;return q;},
    async single(){if(updated&&checks.every(([key,value])=>target[key]===value))Object.assign(target,updated);return {data:{...target},error:null};},
    then(resolve,reject){return q.single().then(resolve,reject);}
   };
   return q;
  }
 };
 return {invoice,payment,db};
};
const oldEnv=process.env.VERCEL_ENV,oldKey=process.env.RESEND_API_KEY;
try{
 process.env.VERCEL_ENV="production";process.env.RESEND_API_KEY="test-only";
 const part=fixture(5000);
 await sendReceipt(part.db,part.payment);
 assert.equal(mailLog.length,1);
 assert.match(mailLog[0].payload.subject,/Kvittering for delbetaling/);
 assert.match(mailLog[0].payload.text,/Dette er en delbetaling/);
 assert.match(mailLog[0].payload.text,/Gjenstående på fakturaen/);
 assert.equal(mailLog[0].payload.attachments.length,2);
 assert.ok(mailLog[0].payload.attachments.every(a=>a.contentType==="application/pdf"),"Both invoice and receipt must advertise proper PDF MIME");
 assert.ok(mailLog[0].payload.attachments[0].filename.startsWith("Kvittering-"));
 assert.ok(mailLog[0].payload.attachments[1].filename.startsWith("Faktura-"));
 assert.match(mailLog[0].payload.html,/Delbetaling registrert/);
 assert.match(mailLog[0].payload.html,/MOTTATT MED VIPPS/);
 assert.match(mailLog[0].payload.html,/Gjenstår på fakturaen/);
 assert.match(mailLog[0].payload.html,/ikke et nytt betalingskrav/);
 assert.ok(!mailLog[0].payload.html.includes("Å betale"),"Receipt HTML should not look like an unpaid invoice");
 assert.match(mailLog[0].payload.text,/ikke et nytt betalingskrav/);
 assert.equal(mailLog[0].payload.attachments[1].content,"frozen-original");
 await sendReceipt(part.db,part.payment);
 assert.equal(mailLog.length,1,"Do not duplicate partial receipt on retry");
 const full=fixture(12500);
 await sendReceipt(full.db,full.payment);
 assert.equal(mailLog.length,2);
 assert.match(mailLog[1].payload.subject,/Kvittering for faktura/);
 assert.doesNotMatch(mailLog[1].payload.subject,/delbetaling/);
 assert.match(mailLog[1].payload.text,/registrert som fullt betalt/);
 assert.ok(mailLog[1].payload.attachments.every(a=>a.contentType==="application/pdf"));
 assert.match(mailLog[1].payload.html,/Fakturaen er betalt/);
 assert.match(mailLog[1].payload.html,/Betalingsreferanse/);
 assert.doesNotMatch(mailLog[1].payload.html,/Gjenstår på fakturaen/);
 assert.doesNotMatch(mailLog[1].payload.text,/Gjenstående på fakturaen/);
 assert.doesNotMatch(mailLog[1].payload.html,/Delbetaling registrert/);
 assert.match(mailLog[1].payload.html,/Dette er en kvittering/);
 assert.doesNotMatch(mailLog[1].payload.text,/Dette er en delbetaling/);
 assert.notEqual(mailLog[0].opts.idempotencyKey,mailLog[1].opts.idempotencyKey);
}finally{
 if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;
 if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey;
}
console.log("Vipps kvittering bestått: delbetaling markert i PDF og e-post, fullt oppgjør tydelig, original faktura vedlagt og ingen duplikatmail.");
