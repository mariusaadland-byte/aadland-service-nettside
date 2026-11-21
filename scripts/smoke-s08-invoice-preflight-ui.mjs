import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const ui=readFileSync("app/admin/faktura/mva/tripletex/TripletexSalesClient.js","utf8");
const route=readFileSync("app/api/admin/tripletex/invoices/direct/route.js","utf8");
const pilot=readFileSync("lib/tripletexDirectInvoicePilot.js","utf8");
const invoiceId="83cf2d28-466f-4bca-a66e-6d05c36c82c7";
for(const label of [
 "Sjekk Tripletex før overføring",
 "Ingen eksakt lik faktura funnet hos samme Tripletex-kunde",
 "Krever kontroll:",
 "preflightByInvoice[x.id]?.safe===false",
 "Overfør denne fakturaen – CSV",
 'action:"check",invoiceId:row.id'
])assert.ok(ui.includes(label),"Missing read-only check or block in UI: "+label);
const s=ui.indexOf(" async function checkUntransferredInvoice(row){");
const e=ui.indexOf("\n async function checkImportedInvoice(row){",s);
assert.ok(s>0&&e>s,"Unable to inspect standalone read-only check");
const functionSource=ui.slice(s,e);
assert.ok(!functionSource.includes('action:"transfer"') ||
 functionSource.includes('NEVER invoke action:"transfer"'),"The check must not transfer");
assert.ok(!functionSource.includes("tripletexCreateUnsentedInvoice"));
assert.ok(!functionSource.includes('action:"prepare"'));
const beforeCreate=route.indexOf('const saved=await s.from("tripletex_direct_invoice_claims").insert({');
const checkExit=route.indexOf('if(body.action==="check")return json(');
assert.ok(checkExit>=0&&beforeCreate>checkExit,"Check must exit before irreversible Tripletex write");
assert.ok(route.includes('!["check","transfer"].includes(body.action)'),"API must restrict allowed actions");
assert.ok(route.includes("Det utelukker ikke tidligere manuell bokføring"));
assert.ok(pilot.includes("duplicateDirectInvoiceSearch"));
assert.ok(pilot.includes('"&customerId="+customerId'),"Tripletex query is scoped to the linked customer");

// Execute only the extracted UI callback with simulated network and state.
let state={},requests=[],isBusy=false;
let providerMode="safe";
const fetchMock=async (url,options)=>{
 assert.equal(url,"/api/admin/tripletex/invoices/direct");
 assert.equal(options.method,"POST");
 const body=JSON.parse(options.body);
 assert.deepEqual(body,{action:"check",invoiceId});
 requests.push(body);
 if(providerMode==="error")throw new Error("simulert API-feil");
 if(providerMode==="duplicate")
  return {ok:false,json:async()=>({error:"Mulig duplikat: samme kunde, dato og beløp."})};
 return {ok:true,json:async()=>({ready:true,grossOre:757500})};
};
const fn=new Function("busy","setBusy","setError","setMessage","setPreflightByInvoice","fetch","directApi",
 functionSource+"\nreturn checkUntransferredInvoice;"
)(false,v=>{isBusy=v},()=>{},()=>{},updater=>{state=updater(state)},fetchMock,"/api/admin/tripletex/invoices/direct");
const row={id:invoiceId,originalNumber:"AS-WEB-2026-000004"};
await fn(row);
assert.equal(requests.length,1);
assert.equal(requests[0].action,"check","No transfer, invoice, or payment side effect");
assert.equal(state[invoiceId].safe,true);
assert.ok(state[invoiceId].message.includes("avgrenset"));
assert.equal(isBusy,false);
providerMode="duplicate";
await fn(row);
assert.equal(state[invoiceId].safe,false);
assert.ok(state[invoiceId].message.includes("Mulig duplikat"));
providerMode="error";
await fn(row);
assert.equal(state[invoiceId].safe,false);
assert.ok(state[invoiceId].message.includes("simulert API-feil"));
assert.equal(requests.length,3,"All three calls are checks, including simulated API failure");
assert.ok(requests.every(x=>x.action==="check"),"Never create or transfer an invoice during a duplicate check");
console.log("S-08 bestått: fakturakontroll bruker bare eksisterende read-only Tripletex-check, viser søkets begrensning og stopper CSV-knappen ved mulig duplikat eller feil.");
