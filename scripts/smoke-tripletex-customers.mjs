import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const source=read("lib/tripletexCustomerSync.js").replace(/^export /gm,"");
const {customerTransferKey,findTripletexCustomerForTransfer,tripletexCustomerPayload}=
 new Function(source+";return {customerTransferKey,findTripletexCustomerForTransfer,tripletexCustomerPayload};")();
const privateCustomer={name:"Ola Nordmann",email:"ola@example.no",phone:"12345678",
 address:"Veien 2, 5000 Bergen",customerType:"private",internalNote:"NEVER SHARE"};
const business={name:"Firma AS",customerType:"business",organizationNumber:"987654321"};
assert.equal(findTripletexCustomerForTransfer(privateCustomer,
 [{id:44,name:"OLA NORDMANN",email:"OLA@example.no"}]).id,44);
assert.equal(customerTransferKey(business).kind,"organizationNumber");
assert.equal(findTripletexCustomerForTransfer(business,
 [{id:45,name:"Unknown",organizationNumber:"987654321"}]).id,45);
assert.equal(findTripletexCustomerForTransfer(business,
 [{id:45,organizationNumber:"987654321"},{id:46,organizationNumber:"987654321"}]).state,"review");
assert.equal(findTripletexCustomerForTransfer(privateCustomer,[]).state,"new");
const noEmail={name:"Kari Utenepost",customerType:"private",email:"",phone:"90505050"};
assert.equal(customerTransferKey(noEmail).kind,"name");
assert.equal(findTripletexCustomerForTransfer(noEmail,[]).state,"new");
assert.equal(findTripletexCustomerForTransfer(noEmail,[{id:70,name:"Annen Kunde"}]).state,"new");
assert.equal(findTripletexCustomerForTransfer(noEmail,
 Array.from({length:1000},(_,i)=>({id:i+1,name:"Annen Kunde "+i}))).state,"review");
assert.equal(findTripletexCustomerForTransfer(noEmail,[{id:71,name:"Kari Utenepost"}]).state,"review",
 "Never guess whether a name-only match is the same customer");
assert.equal(findTripletexCustomerForTransfer({name:""},[]).state,"invalid");
const withoutEmailPayload=tripletexCustomerPayload(noEmail);
assert.equal(Object.hasOwn(withoutEmailPayload,"email"),false);
assert.equal(withoutEmailPayload.phoneNumber,"90505050");
assert.equal(Object.hasOwn(tripletexCustomerPayload({...noEmail,email:"undefined"}),"email"),false);
const payload=tripletexCustomerPayload(privateCustomer);
assert.equal(payload.name,"Ola Nordmann");
assert.equal(payload.postalAddress.postalCode,"5000");
assert.equal(JSON.stringify(payload).includes("NEVER SHARE"),false);
const api=read("app/api/admin/tripletex/customers/route.js");
assert.ok(api.includes('user?.role!=="owner"')&&api.includes("sameOriginGuard(req)"));
assert.ok(api.includes('status:"processing"')&&api.includes('status:"needs_review"'));
assert.ok(api.indexOf('.insert({')<api.indexOf("tripletexCreateCustomer("));
assert.ok(api.includes('action==="check"'));
const client=read("app/admin/faktura/mva/tripletex/TripletexCustomerSyncClient.js");
assert.ok(client.includes("Overfør alle nye kunder")&&client.includes("Kontroller"));
assert.ok(client.includes('E-post ikke oppgitt')&&client.includes('String(c.name||"").trim()'));
assert.ok(read("app/admin/faktura/mva/tripletex/TripletexApiConnectClient.js")
 .includes("<TripletexCustomerSyncClient/>"));
const invoicePreview=read("app/api/admin/tripletex/preview/route.js");
assert.ok(invoicePreview.includes('customerLinks.get(customer.contactId)'));
assert.ok(invoicePreview.includes('previewTripletexInvoice(found,Array.isArray(matches.values)?matches.values:[],vatTypes,linkedId)'));
const mapping=read("lib/tripletexInvoiceMapping.js");
assert.ok(mapping.includes('linkedCustomerId=null'));
const sql=read("supabase/migrations/20261119003000_tripletex_customer_links.sql");
assert.ok(sql.includes("enable row level security")&&sql.includes("grant select,insert,update,delete"));
console.log("Tripletex kundeoverføring bestått: sikker nøkkel/mapping, duplikatsperre, server-autorisasjon, forsiktig POST-claim, RLS og knapper.");
