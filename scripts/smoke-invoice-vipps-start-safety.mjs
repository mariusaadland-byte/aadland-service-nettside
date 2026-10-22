import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const panel=readFileSync("app/admin/faktura/InvoiceVippsPanel.js","utf8");
const customer=readFileSync("app/betaling/faktura/InvoicePaymentResult.js","utf8");
assert.ok(panel.includes("setStatusLoaded(true)"),"Fetch previous payment state before enabling payment");
assert.ok(panel.includes("!statusLoaded||!completed"),"Start action requires loaded state and work confirmation");
assert.ok(panel.includes("if(!window.confirm(details))return;"),"Show final explicit confirmation");
assert.ok(panel.includes("money(outstanding)"),"Show actual remaining amount in confirmation");
assert.ok(panel.includes('String(invoice.customer?.email||"").trim()'),"Show customer email in review");
assert.ok(panel.includes("Dette utsteder fakturaen og låser prisene."),"Warn owner when invoice draft will be issued");
assert.ok(panel.includes("Det opprettes ikke et nytt Vipps-krav."),"Distinguish reusing a request from a new request");
assert.ok(panel.includes("Prøv Vipps-status på nytt"),"Status load failures must be retryable, not silently ignored");
assert.ok(panel.includes('["cancelled","pending","partial","refunded","paid"].includes(payment.state)'),"Allow new confirmed payment on an invoice with outstanding balance after an earlier attempt was paid");
assert.ok(customer.includes("Vipps-betalingen er registrert"),"A captured attempt does not imply that the whole invoice was settled");
assert.ok(!customer.includes("Fakturaen er registrert som betalt."),"Never claim full settlement from payment-attempt state");

const uuid="12345678-1234-4234-8234-123456789abc";
let admin={role:"owner"},forbidden=false,workCompleted=false,starts=0,syncs=0;
const result={reference:"INV-"+uuid,state:"pending",amount_ore:12500,captured_ore:0,refunded_ore:0};
const NextResponse={json(body,opts={}){return {body,status:opts.status||200,headers:opts.headers||{}}}};
const s={from(table){
 assert.equal(table,"invoice_drafts");
 const q={select(){return q;},eq(k,v){assert.equal(k,"id");assert.equal(v,uuid);return q;},async maybeSingle(){return {data:{id:uuid,status:"draft"},error:null}}};return q;
}};
const route=readFileSync("app/api/admin/invoices/vipps/route.js","utf8")
 .replace(/^import .*;\n/gm,"")
 .replace(/^export const .*;\n/gm,"")
 .replace("export async function GET","async function GET")
 .replace("export async function POST","async function POST");
const api=new Function("NextResponse","getAdminUser","db","sameOriginGuard","startInvoiceVipps","reconcileInvoiceVipps","invoiceVippsView",
route+";return {POST};")(
 NextResponse,async()=>admin,()=>s,()=>forbidden?{status:403,body:{error:"origin"}}:null,
 async()=>{starts++;return result;},async()=>{syncs++;return result;},
 p=>({state:p.state,reference:p.reference})
);
const call=async(body)=>api.POST({json:async()=>({id:uuid,...body})});
admin=null;let r=await call({action:"start",workCompleted:true});assert.equal(r.status,403);assert.equal(starts,0);
admin={role:"owner"};forbidden=true;r=await call({action:"start",workCompleted:true});assert.equal(r.status,403);assert.equal(starts,0);
forbidden=false;r=await call({action:"start",workCompleted:false});assert.equal(r.status,400);assert.equal(starts,0);
r=await call({action:"start",workCompleted:true});assert.equal(r.status,200);assert.equal(starts,1);assert.equal(r.body.payment.state,"pending");
r=await call({action:"unknown",workCompleted:true});assert.equal(r.status,400);assert.equal(starts,1);
assert.equal(syncs,0,"No status update or payment requested by accidental admin call");
console.log("Vipps før-betalingskontroll bestått: opplastet status, beløp/mottaker, eksplisitt bekreftelse, rolle/opphav og arbeidsbekreftelse.");
