// Preview-only updates to an existing customer card.
// Source records are public business register data, not billing contacts.
export const companyRegistryFields=[
 {key:"name",label:"Firmanavn"},
 {key:"organizationNumber",label:"Organisasjonsnummer"},
 {key:"address",label:"Registrert adresse"}
];
const string=value=>String(value??"").trim();
export function compareCompanyRegistryCard(card,registry){
 if(!card||!registry||!/^[0-9]{9}$/.test(String(registry.organizationNumber||""))||
    !string(registry.name)||registry.name.length>180||typeof registry.address!=="string")
  throw Error("Registrer et gyldig firma fra Brønnøysundregistrene.");
 const current=string(card.organizationNumber).replace(/\s/g,"");
 const next=registry.organizationNumber;
 const companyMismatch=Boolean(current&&current!==next);
 const comparisons=companyRegistryFields.map(({key,label})=>({
  key,label,current:string(card[key]),proposed:string(registry[key]),
  changed:string(card[key])!==string(registry[key]),
  available: key!=="address"||Boolean(string(registry.address))
 }));
 return {comparisons,companyMismatch,
  warning:companyMismatch?
   "Organisasjonsnummeret på kundekortet tilhører en annen virksomhet. Bekreft at du vil bytte bedrift før oppdatering.":
   "Du kan velge hvilke opplysninger som skal overføres. E-post, telefon, kontaktperson og betalingsinnstillinger blir ikke endret."};
}
export function applyCompanyRegistryCard(card,registry,selectedKeys,{confirmCompanyMismatch=false}={}){
 const preview=compareCompanyRegistryCard(card,registry);
 if(!Array.isArray(selectedKeys)||selectedKeys.some(key=>!companyRegistryFields.some(f=>f.key===key)))
  throw Error("Velg gyldige registerfelt.");
 if(preview.companyMismatch&&!confirmCompanyMismatch)
  throw Error("Bekreft at dette er en annen bedrift før du endrer kundekortet.");
 const next={...card};
 for(const item of preview.comparisons){
  if(selectedKeys.includes(item.key)&&item.changed){
   if(!item.available)throw Error("Registeret har ikke en adresse som kan overføres.");
   next[item.key]=item.proposed;
  }
 }
 if(selectedKeys.length>0)next.customerType="business";
 return next;
}
