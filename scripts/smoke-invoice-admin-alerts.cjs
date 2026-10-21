const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const helper=fs.readFileSync("lib/invoiceAdminAlerts.js","utf8").replace(/^import .*;\n/gm,"").replaceAll("export function ","function ");
const payment=fs.readFileSync("lib/invoicePaymentStatus.js","utf8").replaceAll("export function ","function ");
const date=fs.readFileSync("lib/osloTime.js","utf8").replaceAll("export function ","function ");
const c={Date};vm.createContext(c);vm.runInContext(date+"\n"+payment+"\n"+helper,c);
const invoice={id:"invoice-1",invoice_number:"AS-TEST-1",customer:{name:"Testkunde"},status:"sent",due_date:"2026-10-07",line_items:[{quantity:1,unitPriceOre:10000,vatRate:25}],paid_ore:5000};
const today="2026-10-21";
const notices=(kind,due)=>[{invoice_id:invoice.id,kind,due_date:due,status:"sent",sent_at:"2026-10-01T12:00:00Z"}];
assert.equal(c.invoiceReviewAlerts([invoice],[],today).length,1);
assert.equal(c.invoiceReviewAlerts([{...invoice,due_date:"2026-10-08"}],[],today).length,0);
assert.equal(c.invoiceReviewAlerts([{...invoice,paid_ore:12500}],[],today).length,0);
assert.equal(c.invoiceReviewAlerts([{...invoice,status:"draft"}],[],today).length,0);
for(const kind of ["purring","inkasso"]){
 assert.equal(c.invoiceReviewAlerts([invoice],notices(kind,today),today).length,0);
 assert.equal(c.invoiceReviewAlerts([invoice],notices(kind,"2026-10-20"),today).length,1);
}
const review=c.invoiceReviewAlerts([invoice],notices("purring","2026-10-20"),today)[0];
assert(review.stage.includes("vurder inkassovarsel"));assert.equal(review.outstandingOre,7500);
assert(c.invoiceReviewAlerts([invoice],notices("inkasso","2026-10-20"),today)[0].stage.includes("Inkassovarsel utløpt"));
assert(c.invoiceReviewEmail([review],today).body.includes("75,00"));assert(c.invoiceReviewEmail([review],today).body.includes("/admin/faktura/arkiv?id=invoice-1"));
const route=fs.readFileSync("app/api/cron/invoice-review-alerts/route.js","utf8").replace(/^import .*;\n/gm,"").replaceAll("export async function ","async function ").replaceAll("export const ","const ").replace('const {Resend}=await import("resend");',"const Resend=MockResend;");
class Response{static json(body,options={}){return {body,status:options.status||200}}}
async function run(options={}){
 const sends=[],writes=[],batch={id:"batch-1",created_at:new Date().toISOString(),status:options.alreadySent?"sent":"pending",subject:"Lagret emne",body:"Lagret oversikt",items:[review]};
 function builder(table){return {select(){return this},eq(){return this},neq(){return this},in(){return this},order(){return this},range(){return Promise.resolve({data:table==="invoice_drafts"?(options.empty?[]:[invoice]):[]})},async maybeSingle(){return {data:options.existing||options.alreadySent?batch:null}},async single(){return {data:batch}},upsert(value){writes.push(value);return Promise.resolve({error:null})},update(value){writes.push(value);return this},then(resolve){return Promise.resolve({error:null}).then(resolve)}}}
 class MockResend{constructor(){this.emails={send:async(body,key)=>{sends.push({body,key});return {data:{id:"mock-send"}}}}}}
 const context={NextResponse:Response,process:{env:{VERCEL_ENV:options.preview?"preview":"production",RESEND_API_KEY:"MOCK"}},db:()=>({from:builder}),cronGuard:()=>options.denied?Response.json({error:"Denied"},{status:401}):null,osloDateKey:()=>today,invoiceReviewAlerts:c.invoiceReviewAlerts,invoiceReviewEmail:c.invoiceReviewEmail,MockResend,Date,Error,Promise,setTimeout};
 vm.createContext(context);vm.runInContext(route,context);const response=await context.GET({});return {response,sends,writes};
}
(async()=>{
 const ok=await run();assert.equal(ok.sends.length,1);assert.equal(ok.sends[0].body.to,"post@aadland-service.no");assert.equal(ok.sends[0].body.text,"Lagret oversikt");assert.equal(ok.sends[0].key.idempotencyKey,"invoice-admin-review/batch-1");
 const retry=await run({existing:true});assert.equal(retry.sends[0].key.idempotencyKey,ok.sends[0].key.idempotencyKey);assert.equal(retry.writes.filter(x=>x.alert_day).length,0);
 for(const option of ["alreadySent","denied","preview","empty"]){const r=await run({[option]:true});assert.equal(r.sends.length,0,option);}
 console.log("PASS: 14-day invoice threshold; overdue reminder/notice boundaries; partial/paid filtering; admin-only recipient; frozen daily digest; replay key; authentication; preview and empty-run blocks. No real emails sent.");
})().catch(e=>{console.error(e);process.exit(1)});
