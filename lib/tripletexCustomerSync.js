// Data to transfer to Tripletex. Never include internal notes or other private admin metadata.
const normal=value=>String(value||"").trim().replace(/\s+/g," ").toLocaleLowerCase("nb-NO");
const digits=value=>String(value||"").replace(/\D/g,"");
export const validTripletexCustomerId=id=>Number.isSafeInteger(Number(id))&&Number(id)>0;

export function customerTransferKey(customer){
 const organization=customer.customerType==="business"?digits(customer.organizationNumber):"";
 const email=normal(customer.email);
 if(organization.length===9)return {kind:"organizationNumber",value:organization};
 if(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  return {kind:"email",value:email};
 // Email is optional. Search by name as a fallback; ambiguous matches must
 // be reviewed instead of creating a duplicate customer.
 const name=String(customer?.name||"").trim();
 if(name.length>=2)return {kind:"name",value:name};
 return null;
}

export function findTripletexCustomerForTransfer(customer,candidates){
 const key=customerTransferKey(customer);
 if(!key)return {state:"invalid",reason:"Kundekortet mangler kundenavn."};
 const rows=Array.isArray(candidates)?candidates:[];
 if(rows.length>=(key.kind==="name"?1000:100))
  return {state:"review",reason:"Søket returnerte for mange kunder til en sikker duplikatkontroll."};
 const exact=rows.filter(remote=>key.kind==="organizationNumber"?
  digits(remote.organizationNumber)===key.value:
  key.kind==="email"?
   normal(remote.name)===normal(customer.name)&&
    [remote.email,remote.invoiceEmail].some(email=>normal(email)===key.value):
   normal(remote.name)===normal(customer.name));
 // A matching name alone is not unique enough to silently link two customers.
 if(key.kind!=="name"&&exact.length===1&&validTripletexCustomerId(exact[0].id))
  return {state:"existing",id:Number(exact[0].id)};
 if(key.kind==="name"){
  if(exact.length>0)return {state:"review",reason:
   "Kundenavnet finnes allerede i Tripletex. Kontroller før overføring for å unngå duplikat."};
  // Unlike an e-mail/org-number filter, a full customer list naturally has other names.
  return {state:"new"};
 }
 if(exact.length>0||rows.length>0)
  return {state:"review",reason:"Kunden har flere eller usikre treff i Tripletex. Kontroller før overføring."};
 return {state:"new"};
}

export function tripletexCustomerPayload(customer){
 const name=String(customer?.name||"").trim().slice(0,255);
 const key=customerTransferKey(customer||{});
 if(!name||!key)throw Error("Kunden mangler gyldig navn.");
 const email=String(customer.email||"").trim().toLowerCase().slice(0,240);
 const phone=String(customer.phone||"").trim().slice(0,70);
 const payload={name,isPrivateIndividual:customer.customerType!=="business"};
 // Do not send a fabricated e-mail address or the literal string "undefined".
 if(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))payload.email=email;
 if(phone)payload.phoneNumber=phone;
 if(customer.customerType==="business"&&key.kind==="organizationNumber")
  payload.organizationNumber=key.value;
 // Only transfer a postal address if the free-text Norwegian address is unambiguous.
 const address=String(customer.address||"").trim();
 const match=address.match(/^(.+?)(?:,\s*|\n)(\d{4})\s+([^,\n]{2,100})$/);
 if(match){
  payload.postalAddress={addressLine1:match[1].trim().slice(0,100),
   postalCode:match[2],city:match[3].trim()};
 }
 if(!email)payload.invoiceSendMethod="PAPER";
 return payload;
}


// PUT updates an existing Tripletex customer by its persisted ID. Never blank
// remote fields merely because Aadland has yet to collect contact details.
export function tripletexCustomerCorrection(customer,remote){
 const customerId=Number(remote?.id);
 if(!validTripletexCustomerId(customerId))
  throw Error("Tripletex-kunden har ingen gyldig ID.");
 const local=tripletexCustomerPayload(customer);
 const changes={id:customerId};
 if(Number.isSafeInteger(Number(remote.version))&&Number(remote.version)>=0)
  changes.version=Number(remote.version);
 const warnings=[];
 const set=(field,value,remoteValue)=>{
  if(value&&normal(value)!==normal(remoteValue))changes[field]=value;
 };
 set("name",local.name,remote.name);
 if(local.email)set("email",local.email,remote.email);
 else if(remote.email)warnings.push("Tom e-post i Aadland Service sletter ikke e-post i Tripletex.");
 if(local.phoneNumber)set("phoneNumber",local.phoneNumber,remote.phoneNumber);
 else if(remote.phoneNumber)warnings.push("Tomt telefonfelt sletter ikke telefon i Tripletex.");
 if(local.organizationNumber&&local.organizationNumber!==digits(remote.organizationNumber))
  changes.organizationNumber=local.organizationNumber;
 if(local.postalAddress){
  const old=remote.postalAddress||{};
  const dest=local.postalAddress;
  if(["addressLine1","postalCode","city"].some(k=>normal(dest[k])!==normal(old[k])))
   changes.postalAddress={...(validTripletexCustomerId(old.id)?{id:Number(old.id)}:{}),...dest};
 }else if(String(customer.address||"").trim()){
  warnings.push("Adresseteksten må inneholde gateadresse, postnummer og poststed før den kan korrigeres i Tripletex.");
 }
 return {payload:changes,hasChanges:Object.keys(changes).some(k=>!["id","version"].includes(k)),warnings};
}
