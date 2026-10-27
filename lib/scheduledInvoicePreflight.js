// Read-only final check just before an automatic invoice is issued.
// Never automatically replace the customer's frozen invoice snapshot.
const clean=value=>String(value??"").trim();
const email=value=>clean(value).toLowerCase();
const fields=[
 ["name","name","Navn"],
 ["email","email","E-postadresse"],
 ["address","address","Fakturaadresse"],
 ["phone","phone","Telefon"],
 ["customerType","customer_type","Kundetype"],
 ["organizationNumber","organization_number","Organisasjonsnummer"],
 ["contactPerson","contact_person","Kontaktperson"]
];
export function scheduledInvoicePreflight({invoice,firstInvoice,contact,today}){
 if(!invoice||invoice.status!=="draft"||invoice.split_part!==2||
  !invoice.split_group_id||!invoice.automatic_send||invoice.auto_send_state!=="processing")
  return {ok:false,reason:"Fakturaen har ikke en aktiv, gyldig automatisk sendingsplan."};
 if(!invoice.planned_send_on||invoice.planned_send_on>today)
  return {ok:false,reason:"Den avtalte sendingsdatoen er ikke kommet."};
 if(invoice.first_send_at)
  return {ok:false,reason:"Et tidligere sendeforsøk er registrert. Kontroller e-postloggen før ny sending."};
 if(!firstInvoice||firstInvoice.id!==invoice.split_group_id||
  firstInvoice.status!=="sent"||!firstInvoice.sent_at)
  return {ok:false,reason:"Del 1 er ikke registrert sendt på e-post. Send eller avstem del 1 før del 2 sendes."};
 // A later credit note may change the underlying agreement after scheduling.
 // Never issue the second invoice automatically against a credited first part.
 // This is a review gate, not a cancellation of either existing invoice.
 const credited=Number(firstInvoice.credited_ore);
 if(!Number.isFinite(credited)||credited<0)
  return {ok:false,reason:"Krediteringsstatus for del 1 kunne ikke kontrolleres."};
 if(credited>0)
  return {ok:false,reason:"Del 1 er helt eller delvis kreditert. Kontroller avtalen og faktureringen før del 2 eventuelt sendes."};
 const original=invoice.customer||{};
 if(!clean(original.name)||!clean(original.address)||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(original.email)))
  return {ok:false,reason:"Mottakeren mangler gyldig navn, adresse eller e-post."};
 if(original.paymentMethod==="vipps")
  return {ok:false,reason:"Autosending støtter bare ordinær bankfaktura."};
 if(clean(original.contactId)){
  if(!contact||String(contact.id)!==String(original.contactId))
   return {ok:false,reason:"Kundekortet finnes ikke lenger eller kan ikke kontrolleres."};
  for(const [oldKey,newKey,label] of fields){
   // Normalize empty optional fields and case-insensitive email; all other
   // variations need an explicit owner review before sending to the customer.
   const stored=oldKey==="email"?email(original[oldKey]):clean(original[oldKey]);
   const latest=oldKey==="email"?email(contact[newKey]):clean(contact[newKey]);
   if(stored!==latest)
    return {ok:false,reason:label+" er endret siden fakturaen ble planlagt. Kontroller kunden før sending."};
  }
 }
 return {ok:true,reason:null};
}
