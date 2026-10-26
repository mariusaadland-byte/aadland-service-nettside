import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const file=read("app/api/admin/customer-contacts/route.js");
const client=read("app/admin/kunder/CompanyRegistrySearch.js");
const newCustomer=read("app/admin/kunder/ny/NewCustomerClient.js");
const quote=read("app/admin/tilbud/QuoteCustomerPicker.js");
const drawing=read("app/admin/tegning/QuickCustomerPanel.js");
let access="owner",databaseError=false,readCount=0;
const raw={
 id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",name:"Kunde AS",
 customer_type:"business",organization_number:"987654321",email:"faktura@kunde.no",
 address:"Havnegata 1",payment_terms_days:30,preferred_payment_method:"bank",
 phone:"90000000",contact_person:"Anne",internal_note:"Ikke endre denne",
 created_at:"2026-10-10T12:00:00Z",updated_at:"2026-10-11T12:00:00Z"
};
const db=()=>({from(table){
 assert.equal(table,"admin_customer_contacts");
 const q={
  select(){return q},
  eq(key,value){assert.equal(key,"organization_number");q._value=value;return q;},
  async maybeSingle(){readCount++;return databaseError?{data:null,error:{code:"db-error"}}:
   {data:q._value==="987654321"?raw:null,error:null};},
  order(){return q},
  limit(){return {data:[raw],error:null}}
 };
 return q;
}});
const source=file.replace(/^import .*;\n/gm,"").replace(/^export async function /gm,"async function ");
const GET=new Function("NextResponse","sameOriginGuard","getAdminUser","db",source+";return GET;")(
 {json(body,opt={}){return {body,status:opt.status||200,headers:opt.headers||{}}}},
 ()=>null,async()=>({role:access}),db);
const route=url=>GET({url:"https://localhost/api/admin/customer-contacts"+url});
let r=await route("?organizationNumber=987654321");
assert.equal(r.status,200);
assert.equal(r.body.contact.name,"Kunde AS");
assert.equal(r.body.contact.organizationNumber,"987654321");
assert.equal(r.body.contact.email,"faktura@kunde.no");
assert.equal(r.headers["Cache-Control"],"private, no-store");
r=await route("?organizationNumber=999999999");
assert.equal(r.status,200);assert.equal(r.body.contact,null);
r=await route("?organizationNumber=bad");
assert.equal(r.status,400);
access="none";r=await route("?organizationNumber=987654321");
assert.equal(r.status,403,"Lookup only for existing authorized admins");
access="owner";databaseError=true;r=await route("?organizationNumber=987654321");
assert.equal(r.status,503,"Fail closed on unavailable database");
databaseError=false;
r=await route("");
assert.equal(r.status,200);assert.equal(r.body.contacts.length,1);
assert.ok(readCount>=4);
assert.ok(client.includes("checkExisting=false"));
assert.ok(client.includes("if(result.contact)"));
assert.ok(client.includes("setExistingCustomer(result.contact)"));
assert.ok(client.includes("return; // Fail closed"));
assert.ok(client.includes("onUseExisting(existingCustomer)"));
assert.ok(client.includes("Det opprettes ikke et nytt kundekort"));
assert.ok(!client.includes("fetch(\"/api/admin/customer-contacts\",{"),"Use exact org lookup rather than listing entire customer base");
assert.ok(newCustomer.includes("checkExisting")&&newCustomer.includes("onUseExisting={contact=>"));
assert.ok(newCustomer.includes('customerId="+encodeURIComponent(contact.id)'));
assert.ok(quote.includes("checkExisting")&&quote.includes("onUseExisting={contact=>"));
assert.ok(quote.includes("onChoose(customerSnapshot(contact))"));
assert.ok(drawing.includes("checkExisting")&&drawing.includes("onUseExisting={contact=>pick(contact)}"));
assert.ok(file.includes('eq("organization_number",input.data.organization_number)'),"Server write remains deduplicated");
const migration=read("supabase/migrations/20261026133000_vat_public_registration_hint.sql");
assert.ok(migration.includes("admin_customer_contacts_org_unique"));
console.log("Bedriftskundegjenkjenning bestått: treff i kunderegister, tomt treff, autorisasjon, nettverksfeil og faktura/tilbud/tegning.");
