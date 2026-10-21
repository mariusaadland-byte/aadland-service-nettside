import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const dateCode=readFileSync("lib/osloTime.js","utf8");
const dates=await import("data:text/javascript;base64,"+Buffer.from(dateCode).toString("base64"));
const helper=readFileSync("lib/rentalDepositAlerts.js","utf8").replace(/^import .*;\n/gm,"").replace(/export /g,"");
const {rentalDepositAlerts,rentalDepositEmail}=new Function("shiftDateKey",helper+"return {rentalDepositAlerts,rentalDepositEmail};")(dates.shiftDateKey);
const today="2026-10-21";
const booking=(id,changes={})=>({id,booking_number:"AS-U-"+id,status:"confirmed",deposit_status:"not_paid",deposit_ore:200000,start_date:"2026-10-23",end_date:"2026-10-25",customer:{name:"Testkunde",email:"customer@example.invalid"},rental_items:{name:"Testutstyr"},...changes});
const fixtures=[booking("two-days"),booking("tomorrow",{start_date:"2026-10-22"}),booking("held",{deposit_status:"held"}),booking("cancelled",{status:"cancelled"}),booking("later",{start_date:"2026-10-24"}),booking("free",{deposit_ore:0}),booking("active",{status:"active",start_date:"2026-10-20"}),booking("ended",{start_date:"2026-10-18",end_date:"2026-10-20"})];
const items=rentalDepositAlerts(fixtures,today);
assert.deepEqual(items.map(x=>x.bookingId),["active","tomorrow","two-days"]);
assert.equal(rentalDepositAlerts([booking("month",{start_date:"2026-11-01",end_date:"2026-11-02"})],"2026-10-30").length,1);
const email=rentalDepositEmail(items,today);assert.match(email.body,/2\s?000,00/);assert.ok(!email.body.includes("customer@example.invalid"));
let denied=false,records=[],batches=new Map(),sends=[],keys=new Set();
const env={VERCEL_ENV:"production",RESEND_API_KEY:"mock-only"};
const database={from(table){let op="select",value=null,filters=[],from=0,to=499;const chain={
 select(){return chain},order(){return chain},range(a,b){from=a;to=b;return chain},
 eq(k,v){filters.push(r=>r[k]===v);return chain},neq(k,v){filters.push(r=>r[k]!==v);return chain},
 in(k,v){filters.push(r=>v.includes(r[k]));return chain},gt(k,v){filters.push(r=>r[k]>v);return chain},gte(k,v){filters.push(r=>r[k]>=v);return chain},lte(k,v){filters.push(r=>r[k]<=v);return chain},
 upsert(v){op="insert";value=v;return chain},update(v){op="update";value=v;return chain},
 run(single=false){let rows=table==="rental_bookings"?records:[...batches.values()];rows=rows.filter(r=>filters.every(f=>f(r)));
  if(op==="insert"){if(!batches.has(value.alert_day))batches.set(value.alert_day,{...value,id:"mock-batch",status:"pending",created_at:new Date().toISOString()});return {data:null,error:null};}
  if(op==="update"){for(const row of rows)Object.assign(row,value);return {data:null,error:null};}
  rows=rows.slice(from,to+1);return {data:single?(rows[0]?{...rows[0]}:null):rows,error:null};
 },async maybeSingle(){return chain.run(true)},async single(){return chain.run(true)},then(resolve){resolve(chain.run())}
 };return chain;}};
const route=readFileSync("app/api/cron/rental-deposit-alerts/route.js","utf8").replace(/^import .*;\n/gm,"").replace(/export /g,"").replace('const {Resend}=await import("resend");','const {Resend}=mail;');
const GET=new Function("NextResponse","db","cronGuard","osloDateKey","shiftDateKey","rentalDepositAlerts","rentalDepositEmail","process","mail","setTimeout",route+"return GET;")(
 {json:(body,options={})=>({body,status:options.status||200})},()=>database,()=>denied?{status:401}:null,()=>today,dates.shiftDateKey,rentalDepositAlerts,rentalDepositEmail,{env},
 {Resend:class{emails={send:async(payload,options)=>{sends.push({payload,options});keys.add(options.idempotencyKey);return {data:{id:"mock-email"}}}}}},fn=>fn()
);
denied=true;assert.equal((await GET({})).status,401);denied=false;
env.VERCEL_ENV="preview";assert.equal((await GET({})).status,403);env.VERCEL_ENV="production";
assert.equal((await GET({})).body.sent,0);assert.equal(sends.length,0);
records=fixtures;const result=await GET({});assert.equal(result.body.sent,1);assert.equal(result.body.needsReview,3);
assert.equal(sends[0].payload.to,"post@aadland-service.no");assert.equal(keys.size,1);
assert.equal((await GET({})).body.alreadySent,true);assert.equal(sends.length,1,"Only one daily digest may be sent");
batches.get(today).status="pending";batches.get(today).created_at=new Date(Date.now()-24*60*60*1000).toISOString();
assert.equal((await GET({})).status,409);assert.equal(sends.length,1,"Do not retry outside the idempotency window");
console.log("Depositumvarsler bestått: to dager før, sen booking, registrert depositum, daglig deduplisering, mottaker og tilgang.");
