import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('lib/invoiceVipps.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'').replace('const {Resend}=await import("resend");','const Resend=FakeResend;');
const snapshotSource=readFileSync('lib/invoicePaymentStatus.js','utf8').replace(/^export /gm,'');
const confirmationSnapshot=new Function(snapshotSource+';return invoiceVippsConfirmationSnapshot;')();
const reference='INV-12345678-1234-1234-1234-123456789abc';
let captured=0,captureCalls=0,mails=[],ready=true,wrongCurrency=false,providerMode="authorized",created=0,paymentExists=true,failReceiptOnce=true;
const invoice={id:'invoice-test',invoice_number:'AS-WEB-TEST',status:'issued',customer:{name:'Test',email:'test@example.invalid'},line_items:[{quantity:1,unitPriceOre:10000,vatRate:25}],paid_ore:0,pdf_base64:'frozen-original'};
const payment={id:'12345678-1234-1234-1234-123456789abc',invoice_id:invoice.id,reference,amount_ore:12500,state:'pending',captured_ore:0,refunded_ore:0};
const s={from(table){let values,filters=[];const q={select(){return q},order(){return q},limit(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>r[k]==v);return q},update(v){values=v;return q},async maybeSingle(){if(table==="invoice_vipps_payments"&&!paymentExists)return {data:null,error:null};return q.single()},async single(){const r=table==='invoice_drafts'?invoice:payment;if(values&&filters.every(f=>f(r)))Object.assign(r,values);return {data:{...r},error:null}},then(resolve,reject){return q.single().then(resolve,reject)}};return q},async rpc(name,args){if(name==='prepare_invoice_vipps_v2'){if(invoice.paid_ore>=12500)return {data:null,error:{message:'Fakturaen er betalt.'}};paymentExists=true;return {data:{...payment,delivery_method:args.p_delivery_method,push_phone:args.p_push_phone}};}assert.equal(name,'sync_invoice_vipps');payment.captured_ore=args.p_captured;payment.refunded_ore=args.p_refunded;payment.state=captured===12500?'paid':'authorized';payment.captured_at||=new Date().toISOString();invoice.paid_ore=captured;return {data:{...payment}}}};
class FakeResend{constructor(){this.emails={send:async(payload,options)=>{if(failReceiptOnce&&payload.subject.startsWith('Kvittering')){failReceiptOnce=false;return {error:{message:'Temporary email error'},data:null};}mails.push({payload,options});return {data:{id:'email-test'}}}}}}
const api=new Function('createVippsPayment','getVippsPayment','captureVippsPayment','vippsUnitReadiness','buildInvoiceDraftPdf','invoiceTotalOre','invoiceVippsConfirmationSnapshot','vippsPublicPaymentsEnabled','FakeResend',source+';return {reconcileInvoiceVipps,startInvoiceVipps,invoiceVippsReference};')(
 async input=>{assert.equal(input.unit,'service');assert.equal(input.idempotencyKey,payment.id);assert.equal(input.amountOre,12500);created++;providerMode='created';return {reference,redirectUrl:'https://example.invalid/pay'}},async()=>{if(providerMode==='missing'){const e=Error('Not found');e.status=404;throw e;}return ({reference,redirectUrl:providerMode==='created'?'https://example.invalid/pay':undefined,amount:{currency:wrongCurrency?'EUR':'NOK',value:12500},state:providerMode==='created'?'CREATED':'AUTHORIZED',aggregate:{authorizedAmount:{currency:'NOK',value:12500},capturedAmount:{currency:'NOK',value:captured}}})},async(unit,ref,amount,options)=>{assert.equal(unit,'service');assert.equal(amount,12500);assert.equal(options.idempotencyKey,"cap-"+payment.id);captureCalls++;captured=amount},async()=>({ready}),async i=>{assert.ok(i.paymentReceipt);assert.equal(i.paymentReceipt.amountOre,12500);return Buffer.from('receipt-pdf')},()=>12500,confirmationSnapshot,()=>true,FakeResend);
const oldKey=process.env.RESEND_API_KEY,oldEnv=process.env.VERCEL_ENV;
try{
 process.env.RESEND_API_KEY='test-only';process.env.VERCEL_ENV='production';
 assert.equal(api.invoiceVippsReference(reference),true);assert.equal(api.invoiceVippsReference('invoice-id'),false);
 ready=false;await assert.rejects(api.startInvoiceVipps(s,invoice,confirmationSnapshot(invoice)),/aktiveres/);ready=true;
 wrongCurrency=true;await assert.rejects(api.reconcileInvoiceVipps(s,reference),/feil referanse eller beløp/);assert.equal(captureCalls,0);wrongCurrency=false;
 const first=await api.reconcileInvoiceVipps(s,reference);
 assert.equal(first.state,'paid');assert.equal(captureCalls,1);
 assert.equal(mails.length,0,'A transient receipt failure must not create a duplicate payment');
 assert.ok(first.receipt_error,'Receipt failure must be visible for retries');
 const p=await api.reconcileInvoiceVipps(s,reference);
 assert.equal(p.state,'paid');assert.equal(captureCalls,1);assert.equal(mails.length,1);assert.ok(p.receipt_sent_at);
 assert.equal(p.receipt_error,null,'Retry should clear the receipt error');
 assert.equal(mails[0].payload.to,'test@example.invalid');assert.equal(mails[0].payload.attachments.length,2);assert.equal(mails[0].payload.attachments[1].content,'frozen-original');
 await api.reconcileInvoiceVipps(s,reference);assert.equal(captureCalls,1,'Do not capture twice');assert.equal(mails.length,1,'Do not send receipt twice');
 invoice.paid_ore=0;
 await assert.rejects(api.startInvoiceVipps(s,invoice,confirmationSnapshot(invoice)),/endret seg etter bekreftelsen/,'A newly reconciled payment blocks creation of another request');
 assert.equal(invoice.paid_ore,12500,'Reconciliation must repair stale paid amount');
 assert.equal(created,0,'Do not create a second Vipps payment for a paid invoice');
 providerMode='missing';paymentExists=false;payment.state='pending';payment.captured_ore=0;invoice.paid_ore=0;invoice.sent_at=null;captured=0;payment.request_email_sent_at=null;payment.request_email_first_at=null;
 const started=await api.startInvoiceVipps(s,invoice,confirmationSnapshot(invoice));assert.equal(created,1);assert.equal(started.redirect_url,'https://example.invalid/pay');assert.ok(started.request_email_sent_at);assert.ok(invoice.sent_at);
 const sentCount=mails.length;await api.startInvoiceVipps(s,invoice,confirmationSnapshot(invoice));assert.equal(created,1,'Retry must reuse existing provider reference');assert.equal(mails.length,sentCount,'Retry must not resend the payment email');

}finally{for(const [key,value] of [['RESEND_API_KEY',oldKey],['VERCEL_ENV',oldEnv]]){if(value===undefined)delete process.env[key];else process.env[key]=value}}
console.log('Vipps-faktura bestått: beløp/valuta, capture én gang, kvitteringsfeil og retry, gjenoppretting før ny betaling og idempotens.');
