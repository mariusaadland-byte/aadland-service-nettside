import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const source=read("lib/tripletexCustomerSync.js").replace(/^export /gm,"");
const {customerTransferKey,findTripletexCustomerForTransfer,tripletexCustomerPayload,tripletexCustomerCorrection}=
 new Function(source+";return {customerTransferKey,findTripletexCustomerForTransfer,tripletexCustomerPayload,tripletexCustomerCorrection};")();
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

assert.equal(tripletexCustomerPayload(noEmail).invoiceSendMethod,"MANUAL",
 "Name-only customer must not be registered for postal delivery without a valid postal address");
const remote={id:77,version:3,name:"Kari Utenepost",email:"",phoneNumber:""};
const correction=tripletexCustomerCorrection(
 {...noEmail,email:"kari@example.no",address:"Veien 2, 5000 Bergen"},remote);
assert.equal(correction.payload.id,77);
assert.equal(correction.payload.version,3);
assert.equal(correction.payload.email,"kari@example.no");
assert.equal(correction.payload.postalAddress.postalCode,"5000");
assert.equal(tripletexCustomerCorrection(noEmail,remote).hasChanges,true);
const alreadyUpToDate=tripletexCustomerCorrection(noEmail,
 {...remote,phoneNumber:"90505050"});
assert.equal(alreadyUpToDate.hasChanges,false);
assert.equal(Object.hasOwn(alreadyUpToDate.payload,"email"),false);

const payload=tripletexCustomerPayload(privateCustomer);
assert.equal(payload.name,"Ola Nordmann");
assert.equal(payload.postalAddress.postalCode,"5000");
assert.equal(JSON.stringify(payload).includes("NEVER SHARE"),false);
const api=read("app/api/admin/tripletex/customers/route.js");
assert.ok(api.includes('user?.role!=="owner"')&&api.includes("sameOriginGuard(req)"));
assert.ok(api.includes('status:"processing"')&&api.includes('status:"needs_review"'));
assert.ok(api.indexOf('.insert({')<api.indexOf("tripletexCreateCustomer("));
assert.ok(api.includes('action==="check"'));
assert.ok(api.includes('action==="retryCreate"'));
assert.ok(api.includes('status:"processing"'));
assert.ok(api.includes('eq("status","needs_review")'));
assert.ok(api.includes('match.state!=="new"'));
assert.ok(api.includes('action==="update"')&&api.includes('action==="retryUpdate"'));
assert.ok(api.includes('tripletexUpdateCustomer(customerId,correction.payload'));
assert.ok(api.includes('eq("tripletex_customer_id",customerId)'));
assert.ok(api.includes('action==="saveProfile"'));
const client=read("app/admin/faktura/mva/tripletex/TripletexCustomerSyncClient.js");
assert.ok(client.includes("Overfør alle nye kunder")&&client.includes("Kontroller"));
assert.ok(client.includes("Send alle korrigeringer")&&client.includes("Oppdater i Tripletex"));
assert.ok(client.includes("Kun navn – kontaktopplysninger kan fylles inn senere"));
assert.ok(client.includes("Rett kundekort"));
assert.ok(client.includes("Kontroller og prøv igjen"));
assert.ok(client.includes('single(customer,"retryCreate")'));
assert.ok(client.includes('E-post ikke oppgitt')&&client.includes('String(c.name||"").trim()'));
assert.ok(read("app/admin/faktura/mva/tripletex/TripletexApiConnectClient.js")
 .includes("<TripletexCustomerSyncClient/>"));
const invoicePreview=read("app/api/admin/tripletex/preview/route.js");
assert.ok(invoicePreview.includes('customerLinks.get(customer.contactId)'));
assert.ok(invoicePreview.includes('previewTripletexInvoice(found,Array.isArray(matches.values)?matches.values:[],vatTypes,linkedId)'));
const mapping=read("lib/tripletexInvoiceMapping.js");
assert.ok(mapping.includes('linkedCustomerId=null'));
const tripletexApi=read("lib/tripletexApi.js");
assert.ok(tripletexApi.includes('method:"PUT",body:payload,sessionToken'));
assert.ok(tripletexApi.includes('"/customer/"+customerId'));
const sql=read("supabase/migrations/20261119003000_tripletex_customer_links.sql");
assert.ok(sql.includes("enable row level security")&&sql.includes("grant select,insert,update,delete"));
console.log("Tripletex kundeoverføring bestått: sikker nøkkel/mapping, duplikatsperre, server-autorisasjon, forsiktig POST-claim, RLS og knapper.");
