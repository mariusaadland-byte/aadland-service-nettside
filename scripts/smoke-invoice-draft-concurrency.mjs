import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync("app/api/admin/invoices/route.js","utf8")
 .replace(/^import .*;\n/gm,"")
 .replaceAll("export async function ","async function ");
const recorded={
 id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
 status:"draft",updated_at:"2026-10-22T08:00:00.000Z",
 customer:{name:"Oppdatert kunde",address:"Ny adresse",email:"kunde@example.invalid"},
 line_items:[{description:"Arbeid",quantity:2,unit:"time",unitPriceOre:65000,vatRate:25}]
};
let writes=0;
let revision=1;
const db=()=>({
 from(table){
  assert.equal(table,"invoice_drafts");
  let pending=null;const filters=[];
  const q={
   update(value){pending=value;return q;},
   eq(field,value){filters.push([field,value]);return q;},
   select(){return q;},
   async maybeSingle(){
    const match=filters.every(([field,value])=>recorded[field]===value);
    if(!match)return {data:null,error:null};
    writes++;
    Object.assign(recorded,pending);
    recorded.updated_at="2026-10-22T08:00:"+String(revision++).padStart(2,"0")+".000Z";
    return {data:{id:recorded.id,updated_at:recorded.updated_at},error:null};
   }
  };
  return q;
 }
});
const app=new Function("NextResponse","getAdminUser","db","sameOriginGuard","withInvoicePaymentTerms","osloDateKey",
 source+";return {PATCH};")(
 {json(body,opts={}){return {status:opts.status||200,body}}},
 async()=>({role:"owner"}),db,()=>null,()=>{},()=>{}
);
const send=(expectedUpdatedAt,customer,status)=>app.PATCH({
 json:async()=>({
  id:recorded.id,expectedUpdatedAt,customer:customer||{...recorded.customer},
  title:"Montering",pricingModel:"hourly",lineItems:recorded.line_items,
  notes:"",dueDate:"2026-11-05",dueDateMode:"auto",status
 })
});
const original=recorded.updated_at;
let response=await send(original,{name:"Gammel kunde",address:"Utdatert adresse",email:"gammel@example.invalid"});
assert.equal(response.status,200,"Current revision should save");
assert.equal(writes,1);
assert.ok(response.body.updatedAt&&response.body.updatedAt!==original,"Return updated revision");
const stored={...recorded.customer};
response=await send(original,{name:"Gamle data",address:"Feil adresse"});
assert.equal(response.status,409,"Stale invoice must conflict");
assert.equal(writes,1,"Do not overwrite customer after conflict");
assert.deepEqual(recorded.customer,stored);
response=await send(null,stored);
assert.equal(response.status,409,"Missing revision blocked");
recorded.status="issued";
response=await send(recorded.updated_at,stored);
assert.equal(response.status,409,"Issued invoices are immutable");
assert.equal(writes,1);
const ui=readFileSync("app/admin/faktura/InvoicesClient.js","utf8");
assert.ok(ui.includes("expectedUpdatedAt:snapshot.updated_at"),"UI must pass revision");
assert.ok(ui.includes("updated_at:data.updatedAt"),"UI must refresh revision for next edit");
assert.ok(ui.includes("Hent siste fakturakladd"),"Offer explicit reload of conflicted draft");
assert.ok(ui.includes("Leveringsdato / dato for utført arbeid"),"Offer required work date next to invoice preview");
assert.ok(ui.includes("Utstede faktura på "), "Confirm irreversible issue for printing");
assert.ok(ui.includes('if(!window.confirm("Sende faktura"'),"Explicit approval before sending email");
assert.ok(ui.includes(String.raw`/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/`),"Validate recipient email without accidental double regex escaping");
console.log("Fakturakladd samtidighet bestått: rett revisjon, foreldet kundekort, ingen overskriving, låst faktura og eksplisitt oppdatering.");
