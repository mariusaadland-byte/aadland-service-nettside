import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// All reminder sends stop at mocked RPC. No real database writes or emails.
const paymentSource=readFileSync("lib/invoicePaymentStatus.js","utf8").replace(/^export /gm,"");
const settleSource=readFileSync("lib/invoiceSettlementInfo.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const helpers=new Function(paymentSource+"\n"+settleSource+"\nreturn {invoicePaymentState,invoiceSettlementInfo,summarizeInvoiceActivity};")();
const routeSource=readFileSync("app/api/admin/invoices/reminders/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"").replace(/^export /gm,"");
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001",requestId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001";
const invoice={id,invoice_number:"AS-WEB-TEST",status:"issued",title:"Arbeid",
 due_date:"2026-10-01",customer:{name:"Demo",email:"demo@example.invalid"},
 line_items:[{quantity:1,unitPriceOre:10000,vatRate:25}],paid_ore:7500,credited_ore:0};
let payments=[{invoice_id:id,captured_ore:10000,refunded_ore:2500,state:"partial"}];
let credits=[],rpcCount=0,queryError=false,role="owner";
const db=()=>({
 from(table){
  const query={
   select(){return query;},eq(){return query;},
   async maybeSingle(){
    if(table==="invoice_drafts")return {data:invoice,error:null};
    if(table==="invoice_reminder_sends")return {data:null,error:null};
    throw Error("Unexpected single read "+table);
   },
   async limit(){
    if(queryError)return {data:null,error:{message:"Unavailable"}};
    return {data:table==="invoice_vipps_payments"?payments:
     table==="invoice_credit_notes"?credits:[],error:null};
   }
  };return query;
 },
 async rpc(){rpcCount++;return {data:null,error:{message:"Mock stop; no reminder sent"}};}
});
const NextResponse={json:(body,{status=200}={})=>({status,body})};
const POST=new Function("NextResponse","getAdminUser","sameOriginGuard","db","isValidDateInput","osloDateKey",
 "invoiceSettlementInfo","summarizeInvoiceActivity","reminderText","process",
 routeSource+";return POST;")(
 NextResponse,async()=>({role}),()=>null,db,()=>true,()=>"2026-10-24",
 helpers.invoiceSettlementInfo,helpers.summarizeInvoiceActivity,()=>({subject:"Mock",body:"Mock"}),
 {env:{VERCEL_ENV:"production",RESEND_API_KEY:"mock-only"}}
);
const payload={invoiceId:id,requestId,kind:"purring",dueDate:"2026-11-07",outstandingOre:5000};
const call=reviewedRefundRest=>POST({json:async()=>({...payload,reviewedRefundRest})});
let response=await call(false);
assert.equal(response.status,409);
assert.match(response.body.error,/refusjon/i);
assert.equal(rpcCount,0);
response=await call(true);
assert.equal(response.status,409);
assert.match(response.body.error,/Mock stop/);
assert.equal(rpcCount,1,"Owner-confirmed rest claim may reach atomic reminder RPC");
payments=[...payments,{invoice_id:id,captured_ore:0,refunded_ore:0,state:"pending"}];
response=await call(true);
assert.equal(response.status,409);
assert.match(response.body.error,/åpen Vipps/i);
assert.equal(rpcCount,1);
payments=[{invoice_id:id,captured_ore:12000,refunded_ore:2500,state:"partial"}];
response=await call(true);
assert.equal(response.status,409);
assert.match(response.body.error,/avvik/);
assert.equal(rpcCount,1);
queryError=true;response=await call(true);
assert.equal(response.status,503,"Missing history must fail closed");
assert.equal(rpcCount,1);
queryError=false;role="guest";response=await call(true);
assert.equal(response.status,403);
assert.equal(rpcCount,1);
const ui=readFileSync("app/admin/faktura/InvoiceReminderPanel.js","utf8");
assert.match(ui,/refundedRestReviewed/);
assert.match(ui,/reviewedRefundRest:reviewRequired&&refundedRestReviewed/);
assert.match(ui,/Jeg har kontrollert den registrerte Vipps-refusjonen/);
console.log("Purring etter Vipps-refusjon bestått: eierkontroll, eksplisitt bekreftelse, åpne betalinger, historikkavvik og sikker sperre.");
