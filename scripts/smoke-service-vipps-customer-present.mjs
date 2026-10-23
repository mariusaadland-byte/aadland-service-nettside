import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync("lib/invoiceVipps.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const confirmSource=readFileSync("lib/invoicePaymentStatus.js","utf8").replace(/^export /gm,"");
const {invoiceTotalOre,invoiceVippsConfirmationSnapshot}=new Function(confirmSource+";return {invoiceTotalOre,invoiceVippsConfirmationSnapshot};")();
const invoice={id:"a142bd45-0001-4001-8001-bb12ab12ab12",invoice_number:"AS-PUSH-TEST",
 status:"issued",pdf_base64:"test-pdf-original",customer:{name:"Samtykkende kunde",email:"marius@aadland-service.no"},
 line_items:[{description:"Arbeid",quantity:1,unitPriceOre:80,vatRate:25}],paid_ore:0};
const ref="INV-354ced42-e9cd-4aba-8a6a-123456789012";
const p={id:"ab000011-2222-4333-8444-555566667777",invoice_id:invoice.id,reference:ref,amount_ore:100,
 state:"pending",captured_ore:0,refunded_ore:0,delivery_method:"vipps_push",push_phone:"4795891437",push_requested_at:null};
let prepared=0,creates=0,emails=0,providerReads=0,syncs=0;
let exists=false;
const db={
 from(table){
  let val,check=[];const q={
   select(){return q},eq(k,v){check.push([k,v]);return q;},is(k,v){check.push([k,v]);return q},
   order(){return q},limit(){return q},
   update(v){val=v;return q},
   async maybeSingle(){return {data:table==="invoice_vipps_payments"?(exists?{reference:ref}:null):invoice,error:null};},
   async single(){let target=table==="invoice_drafts"?invoice:p;
    if(val&&check.every(([k,v])=>target[k]===v))Object.assign(target,val);
    return {data:{...target},error:null};},
   then(resolve,reject){return q.single().then(resolve,reject);}
  };return q;
 },
 async rpc(name,args){
  if(name==="prepare_invoice_vipps_v2"){
   prepared++;assert.equal(args.p_delivery_method,"vipps_push");
   if(args.p_push_phone!==p.push_phone)throw Error("wrong phone");
   exists=true;return {data:{...p},error:null};
  }
  if(name==="sync_invoice_vipps"){syncs++;return {data:{...p},error:null};}
  throw Error("Unknown RPC "+name);
 }
};
const api=new Function("createVippsPayment","getVippsPayment","captureVippsPayment",
 "vippsUnitReadiness","buildInvoiceDraftPdf","invoiceTotalOre","invoiceVippsConfirmationSnapshot",
 "vippsPublicPaymentsEnabled",src+";return {verifyPushRequest,startInvoiceVipps,invoiceVippsView};")(
 async input=>{creates++;assert.equal(input.unit,"service");assert.equal(input.userFlow,"PUSH_MESSAGE");
  assert.equal(input.phone,"4795891437");assert.equal(input.amountOre,100);assert.equal(input.idempotencyKey,p.id);
  assert.equal(input.returnUrl,undefined);return {reference:ref,state:"CREATED"};},
 async()=>{providerReads++;if(!exists||creates===0){const e=new Error("Not found");e.status=404;throw e;}
  return {reference:ref,state:"CREATED",amount:{currency:"NOK",value:100},aggregate:{}};},
 async()=>{throw Error("Must never capture without customer approval");},
 async()=>({ready:true}),async()=>{throw Error("PDF should already be frozen");},
 invoiceTotalOre,invoiceVippsConfirmationSnapshot,()=>false
);
const old={VERCEL_ENV:process.env.VERCEL_ENV,VIPPS_SERVICE_PUSH_ENABLED:process.env.VIPPS_SERVICE_PUSH_ENABLED,
 VIPPS_SERVICE_PILOT_EMAIL:process.env.VIPPS_SERVICE_PILOT_EMAIL,RESEND_API_KEY:process.env.RESEND_API_KEY};
try{
 process.env.VERCEL_ENV="production";
 process.env.VIPPS_SERVICE_PILOT_EMAIL="marius@aadland-service.no";
 process.env.RESEND_API_KEY="test-not-sent";
 delete process.env.VIPPS_SERVICE_PUSH_ENABLED;
 const opts={deliveryMethod:"vipps_push",phone:"95891437",customerPresent:true,customerConsent:true};
 assert.throws(()=>api.verifyPushRequest(opts),/godkjenning/,"Push disabled without Vipps approval");
 await assert.rejects(api.startInvoiceVipps(db,invoice,invoiceVippsConfirmationSnapshot(invoice),opts),/godkjenning/);
 assert.equal(prepared,0);assert.equal(creates,0);
 process.env.VIPPS_SERVICE_PUSH_ENABLED="true";
 for(const invalid of [
  {...opts,customerPresent:false}, {...opts,customerConsent:false},{...opts,phone:"123"},
  {...opts,phone:""}, {...opts,phone:"47958914370"},{...opts,deliveryMethod:"not_known"}
 ])assert.throws(()=>api.verifyPushRequest(invalid));
 assert.deepEqual(api.verifyPushRequest({...opts,phone:"+47 958 91 437"}),{method:"vipps_push",phone:"4795891437"});
 let r=await api.startInvoiceVipps(db,invoice,invoiceVippsConfirmationSnapshot(invoice),opts);
 assert.equal(r.delivery_method,"vipps_push");assert.equal(r.push_requested_at!==null,true);
 assert.equal(creates,1);assert.equal(emails,0);
 const view=api.invoiceVippsView(r);
 assert.equal(view.deliveryMethod,"vipps_push");assert.equal(view.phoneLast4,"1437");
 assert.equal(view.redirectUrl,"");
 r=await api.startInvoiceVipps(db,invoice,invoiceVippsConfirmationSnapshot(invoice),opts);
 assert.equal(creates,1,"Same pending reference must not send duplicate Vipps PUSH_MESSAGE");
 assert.ok(providerReads>=2);
 assert.ok(syncs>=1);
 assert.equal(r.delivery_method,"vipps_push");
 assert.equal(emails,0);
}finally{
 for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
}

const client=readFileSync("lib/vippsClient.js","utf8");
const create=client.slice(client.indexOf("export async function createVippsPayment"),client.indexOf("export async function getVippsPayment")).replace("export ","");
const phonePart=client.slice(client.indexOf("function normalizedPhone"),client.indexOf("export function vippsPaymentsEnabled"));
let outgoing=null;
const createPayment=new Function("vippsFetch","vippsIdempotencyKey","process",phonePart+create+";return createVippsPayment;")(
 async(unit,path,opts)=>{outgoing={unit,path,opts};return {};},
 ()=>"test-id", {env:{VIPPS_SERVICE_PUSH_ENABLED:"true"}});
await createPayment({unit:"service",reference:ref,amountOre:100,phone:"95891437",userFlow:"PUSH_MESSAGE"});
assert.equal(outgoing.opts.body.customerInteraction,"CUSTOMER_PRESENT");
assert.equal(outgoing.opts.body.customer.phoneNumber,"4795891437");
assert.equal(outgoing.opts.body.returnUrl,undefined);
assert.equal(outgoing.opts.body.userFlow,"PUSH_MESSAGE");
await assert.rejects(
 new Function("vippsFetch","vippsIdempotencyKey","process",phonePart+create+";return createVippsPayment;")(
 async()=>{throw Error("No network");},()=>"",{env:{}})({unit:"service",reference:ref,amountOre:100,phone:"95891437",userFlow:"PUSH_MESSAGE"}),
 /NOT_APPROVED/
);
const sql=readFileSync("supabase/migrations/20261023144800_invoice_vipps_push_method.sql","utf8");
assert.ok(sql.includes("prepare_invoice_vipps_v2"));
assert.ok(sql.includes("and state in ('pending','authorized')"));
assert.ok(sql.includes("p.delivery_method<>p_delivery_method"));
assert.ok(sql.includes("p.push_phone"));
const route=readFileSync("app/api/admin/invoices/vipps/route.js","utf8");
assert.ok(route.includes("customerPresent:b.customerPresent===true"));
assert.ok(route.includes("customerConsent:b.customerConsent===true"));
const ui=readFileSync("app/admin/faktura/InvoiceVippsPanel.js","utf8");
assert.ok(ui.includes("Kunden er her"));
assert.ok(ui.includes("Kunden har samtykket"));
assert.ok(ui.includes("Send Vipps-varsel"));
assert.ok(ui.includes("!pushApproved"));
console.log("Vipps-varsling bestått: særskilt godkjenning, kunden til stede, samtykke, mobil, CUSTOMER_PRESENT, én forespørsel, ingen e-post ved push.");
