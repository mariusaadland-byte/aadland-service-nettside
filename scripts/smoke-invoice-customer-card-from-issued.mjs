import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const route=read("app/api/admin/invoices/customer-card/route.js");
const source=route.replace(/^import[\s\S]*?;\n/gm,"")
 .replace(/^export /gm,"");
const api=new Function("NextResponse","getAdminUser","sameOriginGuard","db",
 "storedTripletexConnection",source+";return {GET,POST};");
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const nativeId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const c1="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const c2="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const now="2026-11-20T12:00:00.000Z";
let role="owner",writes=0,links=[];
const tables={
 external_customer_invoices:[{id,customer_name:"Ola Nordmann",
  invoice_number:"EXT-11",source_system:"Conta"}],
 invoice_drafts:[{id:nativeId,status:"sent",invoice_number:"AS-33",
  customer:{name:"Ola Nordmann",contactId:c1,email:"ola@example.no",
   phone:"12345678",address:"Kirkegaten 1, 5000 Bergen"}}],
 admin_customer_contacts:[{id:c1,name:"Ola Nordmann",
  email:"ola@example.no",phone:"12345678",address:"Kirkegaten 1, 5000 Bergen",
  customer_type:"private",organization_number:null,contact_person:null,
  payment_terms_days:14,updated_at:now},
 {id:c2,name:"Ola Nordmann AS",email:"bedrift@example.no",
  phone:null,address:null,customer_type:"business",organization_number:"999888777",
  contact_person:null,payment_terms_days:14,updated_at:now}],
 invoice_customer_card_links:[],
 tripletex_customer_links:[{source_type:"contact",source_id:c1,
  environment:"production",status:"linked",tripletex_customer_id:104}]
};
const db=()=>({from:table=>{
 let equals=[],limit=1001;const q={
  select(){return q},
  eq(k,v){equals.push([k,v]);return q},
  order(){return q},limit(n){limit=n;return q},
  maybeSingle(){
   const found=(table==="invoice_customer_card_links"?links:tables[table])
    .filter(row=>equals.every(([k,v])=>row[k]===v));
   return Promise.resolve({data:found.length===1?found[0]:null,error:null});
  },
  insert(row){
   writes++;
   if(table!=="invoice_customer_card_links")throw Error("Unexpected write");
   if(links.some(x=>x.invoice_kind===row.invoice_kind&&x.invoice_id===row.invoice_id))
    return Promise.resolve({error:{code:"23505"}});
   links.push(row);return Promise.resolve({error:null});
  },
  then(resolve,reject){
   const rows=(table==="invoice_customer_card_links"?links:tables[table])
    .filter(row=>equals.every(([k,v])=>row[k]===v)).slice(0,limit);
   return Promise.resolve({data:rows,error:null}).then(resolve,reject);
  }
 };return q;
}});
const NextResponse={json:(v,init={})=>Response.json(v,init)};
const {GET,POST}=api(NextResponse,async()=>({role,id:c1}),
 ()=>null,db,async()=>({environment:"production"}));
const get=async(kind,target)=>{
 const r=await GET(new Request("https://www.aadland-service.no/api/admin/invoices/customer-card?"+
  new URLSearchParams({kind,id:target})));
 return [r.status,await r.json()];
};
const post=async(body)=>{
 const r=await POST(new Request("https://www.aadland-service.no/api/admin/invoices/customer-card",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify(body)
 }));
 return [r.status,await r.json()];
};
let [status,payload]=await get("external",id);
assert.equal(status,200);
assert.equal(payload.invoice.name,"Ola Nordmann");
assert.equal(payload.linkedContact,null);
assert.deepEqual(payload.suggestedIds,[c1]);
assert.equal(payload.invoice.email,"");
[status,payload]=await get("native",nativeId);
assert.equal(status,200);
assert.equal(payload.invoice.email,"ola@example.no");
assert.equal(payload.linkedContact.id,c1);
assert.equal(payload.tripletex.status,"linked");
[status,payload]=await post({action:"link",confirmed:false,kind:"external",id,contactId:c1});
assert.equal(status,400);
assert.equal(writes,0);
[status,payload]=await post({action:"link",confirmed:true,kind:"external",id,contactId:c2});
assert.equal(status,409,"Do not silently attach a different name");
[status,payload]=await post({action:"link",confirmed:true,kind:"external",id,contactId:c1});
assert.equal(status,200);
assert.equal(links.length,1);
[status,payload]=await post({action:"link",confirmed:true,kind:"external",id,contactId:c1});
assert.equal(status,200);
assert.equal(payload.existing,true);
assert.equal(writes,1,"idempotent customer linkage");
[status,payload]=await post({action:"link",confirmed:true,kind:"external",id,contactId:c2,
 nameMismatchConfirmed:true});
assert.equal(status,409);
[status,payload]=await post({action:"link",confirmed:true,kind:"native",id:nativeId,contactId:c2,
 nameMismatchConfirmed:true});
assert.equal(status,409,"immutable issued invoice contact IDs cannot be changed");
[status,payload]=await get("external",id);
assert.equal(payload.linkedContact.id,c1);
assert.equal(payload.tripletex.customerId,104);
assert.equal(tables.invoice_drafts[0].customer.contactId,c1);
assert.equal(tables.external_customer_invoices[0].customer_name,"Ola Nordmann");
assert.ok(route.includes('user?.role!=="owner"'));
assert.ok(route.includes("sameOriginGuard(req)"));
assert.ok(route.includes('process.env.VERCEL_ENV!=="production"'));
assert.ok(!route.includes('invoice_drafts").update('));
assert.ok(!route.includes('external_customer_invoices").update('));
const ui=read("app/admin/faktura/InvoiceCustomerCardButton.js");
for(const marker of [
 "Kundekort","＋ Opprett nytt kundekort","Koble eksisterende",
 "/api/admin/customer-contacts","/api/admin/invoices/customer-card",
 "/api/admin/tripletex/customers","Opprett eller koble kunden i Tripletex",
 "setSavedContact(payload.contact)","similarReviewed",
 "Ingen utstedt faktura endres","nameMismatchConfirmed:mismatch"
])assert.ok(ui.includes(marker),"Missing customer card UI "+marker);
assert.ok(ui.includes('action:status==="linked"?"update":"transfer"'));
const external=read("app/admin/faktura/eksterne/ExternalInvoiceRegisterClient.js");
assert.ok(external.includes('<InvoiceCustomerCardButton invoiceKind="external"'));
const native=read("app/admin/faktura/InvoicesClient.js");
assert.ok(native.includes('<InvoiceCustomerCardButton key={"customer-card-"+form.id} invoiceKind="native"'));
const tripletex=read("app/api/admin/tripletex/customers/route.js");
assert.ok(tripletex.includes("acquireVipps")===false);
assert.ok(tripletex.includes('status:"processing"')&&tripletex.includes('status:"needs_review"'));
assert.ok(tripletex.includes("tripletexCreateCustomer"));
const sql=read("supabase/migrations/20261120152000_invoice_customer_card_links.sql");
assert.ok(sql.includes("enable row level security"));
assert.ok(sql.includes("primary key(invoice_kind,invoice_id)"));
assert.ok(sql.includes("references public.admin_customer_contacts(id)"));
console.log("Kundekort fra sendte/eksterne fakturaer: forhåndsutfylling, eierkontroll, sammenligning av kunde, idempotent kobling, originale fakturaer uendret og trygg eksisterende Tripletex-overføring bestått.");
