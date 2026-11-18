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
 return null;
}

export function findTripletexCustomerForTransfer(customer,candidates){
 const key=customerTransferKey(customer);
 if(!key)return {state:"invalid",reason:"Kundekortet trenger e-post eller organisasjonsnummer."};
 const rows=Array.isArray(candidates)?candidates:[];
 if(rows.length>=100)return {state:"review",reason:"For mange treff i Tripletex. Kontroller kunden manuelt."};
 const exact=rows.filter(remote=>key.kind==="organizationNumber"?
  digits(remote.organizationNumber)===key.value:
  normal(remote.name)===normal(customer.name)&&
   [remote.email,remote.invoiceEmail].some(email=>normal(email)===key.value));
 if(exact.length===1&&validTripletexCustomerId(exact[0].id))
  return {state:"existing",id:Number(exact[0].id)};
 if(exact.length>1||rows.length>0)
  return {state:"review",reason:"Kunden har flere eller usikre treff i Tripletex. Kontroller før overføring."};
 return {state:"new"};
}

export function tripletexCustomerPayload(customer){
 const name=String(customer?.name||"").trim().slice(0,255);
 const key=customerTransferKey(customer||{});
 if(!name||!key)throw Error("Kunden mangler navn eller sikker identifikasjon.");
 const email=String(customer.email||"").trim().toLowerCase().slice(0,240);
 const phone=String(customer.phone||"").trim().slice(0,70);
 const payload={name,isPrivateIndividual:customer.customerType!=="business"};
 if(email)payload.email=email;
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
 return payload;
}
