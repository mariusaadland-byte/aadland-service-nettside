const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let source=fs.readFileSync('app/api/admin/invoices/send/route.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export const ','const ').replace('export async function POST','async function POST').replace('await import("resend")','({Resend:MockResend})');
async function setup(failFirst=false){
 const initial={id:'invoice-test',status:'draft',updated_at:'2026-10-21T00:00:00Z',customer:{name:'Test',email:'test@example.invalid'},title:'Arbeid',line_items:[{quantity:8,unitPriceOre:35000,vatRate:25}],due_date:'2026-11-04'};
 const invoice={...initial},sends=[];let issues=0;
 const api={from(){let changes=null,filters=[];const result=()=>{if(changes&&filters.every(([key,value])=>value===null?invoice[key]==null:invoice[key]===value))Object.assign(invoice,changes);return {data:{...invoice},error:null}};
 const chain={select(){return chain},eq(k,v){filters.push([k,v]);return chain},is(k,v){filters.push([k,v]);return chain},update(v){changes=v;return chain},maybeSingle:async()=>result(),single:async()=>result(),then(a,b){return Promise.resolve(result()).then(a,b)}};return chain},
 async rpc(){issues++;Object.assign(invoice,{status:'issued',invoice_number:'AS-WEB-2026-000001',issued_date:'2026-10-21'});return {data:{...invoice},error:null}}};
 class Resend{constructor(){this.emails={send:async(payload,options)=>{sends.push({payload,options});if(failFirst&&sends.length===1)throw Error('Test timeout');return {data:{id:'provider-test'},error:null}}}}}
 const context={console:{error(){}},Buffer,Date,Intl,Error,process:{env:{RESEND_API_KEY:'test-only',VERCEL_ENV:'production'}},NextResponse:{json:(body,o)=>({body,status:o?.status||200})},getAdminUser:async()=>({role:'owner'}),sameOriginGuard:()=>null,db:()=>api,buildInvoiceDraftPdf:async()=>Buffer.from('%PDF-1.4 test'),MockResend:Resend};
 vm.createContext(context);vm.runInContext(source,context);
 return {invoice,sends,get issues(){return issues},run:()=>context.POST({json:async()=>({id:'invoice-test'})})};
}
(async()=>{
 const happy=await setup();const first=await happy.run();assert.equal(first.status,200);assert.equal(happy.issues,1);assert.equal(happy.invoice.status,'sent');assert.equal(happy.sends[0].payload.to,'test@example.invalid');assert(happy.sends[0].payload.attachments[0].content);assert.equal(happy.sends[0].options.idempotencyKey,'invoice-send/invoice-test');await happy.run();assert.equal(happy.sends.length,1);
 const retry=await setup(true);assert.equal((await retry.run()).status,502);assert.equal(retry.invoice.status,'issued');assert.equal((await retry.run()).status,200);assert.equal(retry.issues,1);assert.deepEqual(retry.sends[0],retry.sends[1]);
 console.log('PASS: issue once; attached frozen PDF; recipient and idempotency key; sent guard; retry reuses same number and email payload.');
})().catch(e=>{console.error(e);process.exit(1)});
