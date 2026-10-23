import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const paymentSource=readFileSync("lib/invoicePaymentStatus.js","utf8").replace(/^export /gm,"");
const payment=new Function(paymentSource+";return {invoiceTotalOre,invoiceVippsConfirmationSnapshot};")();
const source=readFileSync("lib/invoiceVipps.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const client=readFileSync("lib/vippsClient.js","utf8");
const enabledSource=client.slice(client.indexOf("function enabled(unit){"),client.indexOf("async function parseResponse"));
const exportSource=client.slice(client.indexOf("export function vippsPaymentsEnabled("),client.indexOf("export function vippsIdempotencyKey(")).replace(/^export /gm,"");
const env={VIPPS_SERVICE_PILOT_EMAIL:"marius@aadland-service.no",VERCEL_ENV:"production"};
const fakeProcess={env};
const {vippsPaymentsEnabled,vippsPublicPaymentsEnabled}=new Function("process",enabledSource+exportSource+";return {vippsPaymentsEnabled,vippsPublicPaymentsEnabled};")(fakeProcess);
assert.equal(vippsPublicPaymentsEnabled("service"),false,"Public checkout must be disabled by default");
env.VIPPS_SERVICE_PUBLIC_PAYMENTS_ENABLED="true";
assert.equal(vippsPublicPaymentsEnabled("service"),false,"Public switch without engine cannot create payments");
env.VIPPS_SERVICE_PAYMENTS_ENABLED="true";
assert.equal(vippsPublicPaymentsEnabled("service"),true);
assert.equal(vippsPublicPaymentsEnabled("rental"),false);
delete env.VIPPS_SERVICE_PUBLIC_PAYMENTS_ENABLED;
assert.equal(vippsPublicPaymentsEnabled("service"),false,"Active pilot alone never opens checkout");
assert.equal(vippsPaymentsEnabled("service"),true);

const readinessSource=readFileSync("lib/vippsReadiness.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const readiness=new Function("vippsPaymentsEnabled","vippsPublicPaymentsEnabled","vippsUnitConfig","process",readinessSource+";return vippsUnitReadiness;")(
 vippsPaymentsEnabled,vippsPublicPaymentsEnabled,
 unit=>({unit,configured:true}),
 fakeProcess
);
const database={async rpc(){return {data:[{unit:"service",active:true,webhookId:"test-webhook"}],error:null};}};
assert.equal((await readiness(database,"service")).reason,"public-disabled","No public checkout during private pilot");
assert.equal((await readiness(database,"service",{audience:"admin"})).ready,true,"Owner-initiated invoice checkout is possible only with engine enabled");
assert.equal((await readiness(database,"rental",{audience:"admin"})).reason,"disabled","Rental remains off");
env.VIPPS_SERVICE_PAYMENTS_ENABLED="false";
assert.equal((await readiness(database,"service",{audience:"admin"})).reason,"disabled","Engine off stops even an admin pilot");
env.VIPPS_SERVICE_PAYMENTS_ENABLED="true";

let providerReads=0,providerCreates=0,dbReads=0,prepared=0;
const invoice={
 id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",invoice_number:"AS-PILOT-1",
 status:"issued",title:"Pilot",notes:"",customer:{name:"Egen test",email:"marius@aadland-service.no"},
 pricing_model:"fixed",line_items:[{description:"Pilot",quantity:1,unitPriceOre:80,vatRate:25}],paid_ore:0,
 pdf_base64:"not-real-pdf"
};
const providerDb={
 from(table){
  dbReads++;
  return {select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},
   async maybeSingle(){return {data:table==="invoice_vipps_payments"?null:invoice,error:null};}};
 },
 async rpc(name){
  if(name==="get_vipps_webhook_status")return {data:[{unit:"service",active:true}],error:null};
  assert.equal(name,"prepare_invoice_vipps");prepared++;
  return {data:{id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",reference:"INV-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",amount_ore:200},error:null};
 }
};
const getters=new Function(
 "vippsPublicPaymentsEnabled","invoiceTotalOre","invoiceVippsConfirmationSnapshot",
 "vippsUnitReadiness","getVippsPayment","createVippsPayment","captureVippsPayment","buildInvoiceDraftPdf","process",
 source+";return {verifyInvoicePilot,startInvoiceVipps};"
)(
 vippsPublicPaymentsEnabled,payment.invoiceTotalOre,payment.invoiceVippsConfirmationSnapshot,
 readiness,async()=>{providerReads++;throw Error("Unexpected Vipps API GET");},
 async()=>{providerCreates++;throw Error("Unexpected Vipps API payment");},
 async()=>{throw Error("Unexpected capture");},async()=>{throw Error("Unexpected PDF generation");},fakeProcess
);
const valid=payment.invoiceVippsConfirmationSnapshot(invoice);
assert.doesNotThrow(()=>getters.verifyInvoicePilot(invoice),"Only configured 1 NOK owner pilot allowed");
const badAmount={...invoice,line_items:[{description:"Pilot",quantity:1,unitPriceOre:100,vatRate:25}]};
assert.throws(()=>getters.verifyInvoicePilot(badAmount),/1,00 kr/);
const badRecipient={...invoice,customer:{...invoice.customer,email:"random@example.invalid"}};
assert.throws(()=>getters.verifyInvoicePilot(badRecipient),/testadresse/);
delete env.VIPPS_SERVICE_PILOT_EMAIL;
assert.throws(()=>getters.verifyInvoicePilot(invoice),/testadresse/,"No pilot inbox means no real payment");
env.VIPPS_SERVICE_PILOT_EMAIL="marius@aadland-service.no";
await assert.rejects(getters.startInvoiceVipps(providerDb,badRecipient,payment.invoiceVippsConfirmationSnapshot(badRecipient)),/testadresse/);
await assert.rejects(getters.startInvoiceVipps(providerDb,badAmount,payment.invoiceVippsConfirmationSnapshot(badAmount)),/1,00 kr/);
assert.equal(prepared,0,"No database changes for unauthorized pilot invoice");
assert.equal(dbReads,0,"Rejected pilot never accesses database");
assert.equal(providerReads,0);
assert.equal(providerCreates,0);
await assert.rejects(getters.startInvoiceVipps(providerDb,invoice,valid),/Restbeløpet ble endret/,"Ledger race must stop before any Vipps provider action or email");
assert.equal(prepared,1);
assert.equal(providerReads,0,"No provider read after ledger mismatch");
assert.equal(providerCreates,0,"No external payment after ledger mismatch");
env.VIPPS_SERVICE_PUBLIC_PAYMENTS_ENABLED="true";
assert.doesNotThrow(()=>getters.verifyInvoicePilot(badAmount),"Public mode may eventually accept legitimate customer invoices");
delete env.VIPPS_SERVICE_PUBLIC_PAYMENTS_ENABLED;

const admin=readFileSync("app/api/admin/invoices/vipps/route.js","utf8");
assert.ok(admin.includes('user.role!=="owner"'),"Pilot start limited to owner");
const ui=readFileSync("app/admin/vipps/VippsStatusClient.js","utf8");
assert.ok(ui.includes("Kontrollert prøvebetaling: 1,00 kr"));
assert.ok(ui.includes("VIPPS_SERVICE_PUBLIC_PAYMENTS_ENABLED=false"));
const status=readFileSync("app/api/admin/vipps-status/route.js","utf8");
assert.ok(status.includes("publicEnabled:vippsPublicPaymentsEnabled(unit.unit)"));
assert.ok(status.includes("pilotEmailConfigured:"));
assert.ok(!status.includes("pilotEmail:"));
const readys=readFileSync("lib/vippsReadiness.js","utf8");
assert.ok(readys.includes('audience="public"'));
assert.ok(readys.includes("!vippsPublicPaymentsEnabled(key)"));
assert.ok(readys.includes('reason:"public-disabled"'));
console.log("Vipps 1-kr pilot bestått: kundebetaling sperret, eier/epost/beløp låst, Utleie av, feilsaldo stopper før Vipps og ingen ekte betalinger.");
