import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// A real expired Vipps ePayment may report 100 øre released/cancelled even
// when 0 øre were authorized. It is NOT payment: never capture or credit it.
// Crucially the invoice must become eligible for a fresh attempt.
const source=readFileSync("lib/invoiceVipps.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const base={id:"7929ccaf-ab77-4906-bb1c-d37fface1175",invoice_id:"f90189f4-7aad-4912-b509-4a6a57cccd95",
 reference:"INV-c1812cfe-5131-4933-8f13-db57388ea68f",state:"pending",
 amount_ore:100,captured_ore:0,refunded_ore:0,receipt_sent_at:null};
const provider=(state,authorized=0,cancelled=100,captured=0,refunded=0)=>({
 reference:base.reference,state,amount:{currency:"NOK",value:100},
 aggregate:{
  authorizedAmount:{currency:"NOK",value:authorized},
  cancelledAmount:{currency:"NOK",value:cancelled},
  capturedAmount:{currency:"NOK",value:captured},
  refundedAmount:{currency:"NOK",value:refunded}
 }
});
let calls=0,captures=0,payment=provider("EXPIRED"),syncParams=null;
const s={from(table){
 assert.equal(table,"invoice_vipps_payments");
 return {select(){return this;},eq(k,v){assert.equal(k,"reference");assert.equal(v,base.reference);return this;},
  async single(){return {data:{...base},error:null};}};
 },async rpc(name,args){
  assert.equal(name,"sync_invoice_vipps");syncParams=args;
  return {data:{...base,state:"cancelled"},error:null};
 }};
const api=new Function("getVippsPayment","captureVippsPayment","process",
 source+";return {validateSnapshot,reconcileInvoiceVipps};")(
 async()=>{calls++;return payment;},
 async()=>{captures++;throw Error("Never charge an expired payment");},
 {env:{VERCEL_ENV:"production"}}
);
const amounts=api.validateSnapshot(provider("EXPIRED",0,100,0,0),base);
assert.deepEqual(amounts,{authorized:0,cancelled:100,captured:0,refunded:0});
for(const finalState of ["EXPIRED","ABORTED","TERMINATED"]){
 assert.doesNotThrow(()=>api.validateSnapshot(provider(finalState,0,100,0,0),base));
}
assert.doesNotThrow(()=>api.validateSnapshot(provider("CREATED",0,0,0,0),base));
assert.doesNotThrow(()=>api.validateSnapshot(provider("AUTHORIZED",100,100,0,0),base),
 "Authorized payment with fully cancelled reservation is valid");
assert.throws(()=>api.validateSnapshot(provider("AUTHORIZED",0,100,0,0),base),/Ugyldige Vipps-summer/);
assert.throws(()=>api.validateSnapshot(provider("EXPIRED",100,100,100,0),base),/Ugyldige Vipps-summer/,
 "Never credit a terminated payment even if provider claims captures");
assert.throws(()=>api.validateSnapshot(provider("EXPIRED",0,100,0,100),base),/Ugyldige Vipps-summer/);
assert.throws(()=>api.validateSnapshot(provider("EXPIRED",0,101,0,0),base),/Ugyldige Vipps-summer/);
assert.throws(()=>api.validateSnapshot({...provider("EXPIRED"),amount:{currency:"EUR",value:100}},base),/feil referanse eller beløp/);
assert.throws(()=>api.validateSnapshot(provider("UNKNOWN",0,0,0,0),base),/Ukjent Vipps/);
const r=await api.reconcileInvoiceVipps(s,base.reference);
assert.equal(r.state,"cancelled","The old expired attempt is closed so a fresh attempt can be made");
assert.equal(calls,1,"Get the prior provider status exactly once");
assert.equal(captures,0,"Never capture the expired amount");
assert.equal(syncParams.p_reference,base.reference);
assert.equal(syncParams.p_state,"EXPIRED");
assert.equal(syncParams.p_captured,0);
assert.equal(syncParams.p_refunded,0);
const sql=readFileSync("supabase/migrations/20261021170655_customer_invoice_payment_terms.sql","utf8");
const sq=readFileSync("supabase/migrations/20261023144800_invoice_vipps_push_method.sql","utf8");
assert.ok(sq.includes("state in ('pending','authorized')"),"Renewal must insert a new attempt, not reuse the closed one");
const admin=readFileSync("app/admin/faktura/InvoiceVippsPanel.js","utf8");
assert.ok(admin.includes('["cancelled","pending","partial","refunded","paid"].includes(payment.state)'),"Admin can retry on cancelled");
const impl=readFileSync("lib/invoiceVipps.js","utf8");
assert.ok(impl.includes('await reconcileInvoiceVipps(s,previous.data.reference)'),"Must confirm no previous capture before new payment");
assert.ok(impl.includes('requestEmailId=await mail('),"A new payment mails the customer");
assert.ok(impl.includes('const paymentLink=shortPaymentUrl(p.reference)'),"Renewed email uses fixed short-link flow");
assert.ok(sql.includes("issue_invoice_draft"),"Invoice issuance unchanged");
console.log("Vipps utløpsfornyelse bestått: avbrutt/utløpt gir avsluttet forsøksstatus uten fangst, dobbelbetaling eller bokføring; ny kortlenke kan sendes på samme faktura.");
