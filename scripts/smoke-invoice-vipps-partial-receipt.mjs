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
assert.ok(partialPdf.includes("DELBETALT MED VIPPS:"),"Explicit partial payment label");
assert.ok(partialPdf.includes("Dette er en delbetaling, ikke en fullt betalt faktura."),"Warn that payment was not full");
assert.ok(partialPdf.includes("Gjenst"),"Partial receipt shows outstanding amount");
const fullPdf=(await buildPdf({...baseInvoice,paymentReceipt:{...partialData,amountOre:12500,outstandingOre:0}})).toString("latin1");
assert.ok(fullPdf.includes("KVITTERING"),"Full payment receipt title");
assert.ok(!fullPdf.includes("KVITTERING - DELBETALING"),"Full payment must not be mislabelled");
assert.ok(fullPdf.includes("BETALT MED VIPPS:"));
assert.ok(!fullPdf.includes("Dette er en delbetaling, ikke en fullt betalt faktura."));

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
 assert.equal(mailLog[0].payload.attachments[1].content,"frozen-original");
 await sendReceipt(part.db,part.payment);
 assert.equal(mailLog.length,1,"Do not duplicate partial receipt on retry");
 const full=fixture(12500);
 await sendReceipt(full.db,full.payment);
 assert.equal(mailLog.length,2);
 assert.match(mailLog[1].payload.subject,/Kvittering for faktura/);
 assert.doesNotMatch(mailLog[1].payload.subject,/delbetaling/);
 assert.match(mailLog[1].payload.text,/registrert som fullt betalt/);
 assert.doesNotMatch(mailLog[1].payload.text,/Dette er en delbetaling/);
 assert.notEqual(mailLog[0].opts.idempotencyKey,mailLog[1].opts.idempotencyKey);
}finally{
 if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;
 if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey;
}
console.log("Vipps kvittering bestått: delbetaling markert i PDF og e-post, fullt oppgjør tydelig, original faktura vedlagt og ingen duplikatmail.");
