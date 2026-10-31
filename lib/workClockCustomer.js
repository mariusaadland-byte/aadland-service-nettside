// A saved contact or a customer account can be chosen independently from an order.
// Identifiers, not a free-text label, keep visits to a repeat customer linked.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseWorkClockCustomerRef(value){
 if(value==null||value==="")return null;
 if(typeof value!=="string"||value.length>55)return {error:"Ugyldig kundevalg."};
 const match=/^(contact|profile):(.+)$/.exec(value);
 if(!match||!UUID.test(match[2]))return {error:"Velg kunden på nytt fra kunderegisteret."};
 return {kind:match[1],id:match[2].toLowerCase(),ref:match[1]+":"+match[2].toLowerCase()};
}
export async function resolveWorkClockCustomer(db,ref){
 const parsed=parseWorkClockCustomerRef(ref);
 if(!parsed||parsed.error)return {error:parsed?.error||"Kunden mangler."};
 const table=parsed.kind==="contact"?"admin_customer_contacts":"customer_profiles";
 const {data,error}=await db.from(table).select("id,name").eq("id",parsed.id).maybeSingle();
 if(error)return {error:"Kunne ikke kontrollere valgt kunde. Prøv igjen."};
 if(!data||!String(data.name||"").trim())
  return {error:"Kunden finnes ikke lenger i kunderegisteret."};
 return {customerRef:parsed.ref,customerLabel:String(data.name).trim().slice(0,180)};
}
