const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const helper=fs.readFileSync("lib/invoiceReminders.js","utf8").replaceAll("export function ","function ");
const status=fs.readFileSync("lib/invoicePaymentStatus.js","utf8").replaceAll("export function ","function ");
const route=fs.readFileSync("app/api/admin/invoices/reminders/route.js","utf8").replace(/^import .*;\n/gm,"").replaceAll("export async function ","async function ").replaceAll("export const ","const ").replace('const {Resend}=await import("resend");',"const Resend=MockResend;");
const invoiceId="12345678-1234-4234-8234-123456789abc",requestId="22345678-1234-4234-8234-123456789abc";
class Response{constructor(body,options={}){this.body=body;this.status=options.status||200;this.headers=options.headers}static json(body,options){return new Response(body,options)}}
async function run(options={}){
 const sends=[],updates=[],invoice={id:invoiceId,invoice_number:"AS-TEST-1",status:"sent",title:"Arbeid",due_date:"2026-10-01",customer:{name:"Testkunde",email:"kunde@example.com"},line_items:[{quantity:1,unitPriceOre:10000,vatRate:25}],paid_ore:options.paid?12500:5000,pdf_base64:"ORIGINAL"};
 const record={id:requestId,invoice_id:invoiceId,recipient:"kunde@example.com",subject:"Purring – faktura AS-TEST-1",body:"Lagret standardtekst",outstanding_ore:7500,kind:"purring",due_date:"2026-11-04",document_date:"2026-10-21",status:options.alreadySent?"sent":"pending",pdf_base64:"NOTICE"};
 function builder(table){return {select(){return this},eq(){return this},is(){return this},neq(){return this},update(data){updates.push({table,data});return this},async maybeSingle(){return {data:table==="invoice_drafts"?invoice:null}},async single(){return {data:table==="invoice_drafts"?invoice:record}},then(resolve){return Promise.resolve({error:null}).then(resolve)}}}
 const context={NextResponse:Response,Buffer,URL,Number,Date,Error,process:{env:{RESEND_API_KEY:"MOCK",VERCEL_ENV:options.preview?"preview":"production"}},getAdminUser:async()=>options.denied?null:{role:"owner",id:invoiceId},sameOriginGuard:()=>options.crossOrigin?Response.json({error:"Origin"},{status:403}):null,osloDateKey:()=>"2026-10-21",isValidDateInput:x=>/^\d{4}-\d{2}-\d{2}$/.test(x),db:()=>({from:builder,rpc:async()=>options.rpcError?{error:{message:"Stoppet"}}:{data:record}}),MockResend:class {constructor(){this.emails={send:async(body,key)=>{sends.push({body,key});return options.failed?{error:{message:"Timeout"}}:{data:{id:"mock-email"}}}}}}};
 vm.createContext(context);vm.runInContext(helper+"\n"+status+"\n"+route,context);
 const response=await context.POST({json:async()=>({invoiceId,requestId,kind:"purring",dueDate:"2026-11-04",outstandingOre:7500})});
 return {response,sends,updates,context};
}
(async()=>{
 const ok=await run();assert.equal(ok.response.status,200);assert.equal(ok.sends.length,1);assert.equal(ok.sends[0].body.to,"kunde@example.com");assert.equal(ok.sends[0].body.attachments.length,2);assert.equal(ok.sends[0].body.attachments[1].content,"ORIGINAL");assert.equal(ok.sends[0].key.idempotencyKey,"invoice-reminder/"+requestId);
 for(const option of ["denied","preview","crossOrigin","paid","rpcError"]){const r=await run({[option]:true});assert.equal(r.sends.length,0,option);}
 const again=await run({alreadySent:true});assert.equal(again.sends.length,0);assert.equal(again.response.body.alreadySent,true);
 const failed=await run({failed:true});assert.equal(failed.response.status,502);assert(failed.updates.some(x=>x.data.status==="failed"));
 const c=ok.context;assert.equal(c.reminderDateAfter("2026-12-25"),"2027-01-08");
 assert.equal(c.nextInvoiceReminder([],"2026-10-21").kind,"purring");
 const last={kind:"purring",status:"sent",sent_at:"2026-10-01T12:00:00Z",due_date:"2026-10-15"};
 assert.equal(c.nextInvoiceReminder([last],"2026-10-21").kind,"inkasso");
 assert(c.nextInvoiceReminder([{...last,kind:"inkasso"}],"2026-10-21").done);
 const text=c.reminderText({invoice_number:"AS-1",customer:{name:"Test"},title:"Arbeid",due_date:"2026-10-01"},"inkasso","2026-11-04",7500);
 assert(text.body.includes("oversendt til inkasso"));assert(text.body.includes("04.11.2026"));assert(text.body.includes("75,00"));
 console.log("PASS: authorization, origin, preview block, paid/stale balances, replay, failure log, two attachments, stable send key, deadlines and notice stages. No real email sent.");
})().catch(e=>{console.error(e);process.exit(1)});

