// Norwegian Registry of Business Enterprises (Brønnøysundregistrene) open API.
const compact=value=>String(value||"").replace(/\s+/g," ").trim();
export const validCompanyQuery=query=>{
 const value=compact(query);
 if(value.length<3||value.length>100||/[<>\\\u0000-\u001f]/.test(value))
  throw Error("Skriv minst tre tegn av firmanavn eller et organisasjonsnummer.");
 return value;
};
export const formattedBusinessAddress=record=>{
 const a=record?.forretningsadresse||record?.postadresse;
 if(!a||!Array.isArray(a.adresse))return "";
 const lines=[...a.adresse.map(compact).filter(Boolean),
  [compact(a.postnummer),compact(a.poststed)].filter(Boolean).join(" ")];
 return lines.filter(Boolean).join("\n").slice(0,500);
};
export function mapBrregCompany(record){
 const organizationNumber=String(record?.organisasjonsnummer||"");
 const name=compact(record?.navn);
 if(!/^\d{9}$/.test(organizationNumber)||name.length<2||name.length>180)return null;
 const website=compact(record?.hjemmeside||"");
 const businessForm=compact(record?.organisasjonsform?.kode||"");
 return {organizationNumber,name,address:formattedBusinessAddress(record),
  registeredForVat:record?.registrertIMvaregisteret===true,
  businessForm,businessStatus:record?.konkurs===true?"Under konkurs":record?.underAvvikling===true?"Under avvikling":"",
  website:/^https?:\/\//i.test(website)?website.slice(0,250):"",
  source:"Brønnøysundregistrene"};
}
export async function searchBrregCompanies(input,fetcher=fetch){
 const query=validCompanyQuery(input);
 const numeric=query.replace(/\s/g,"");
 const base="https://data.brreg.no/enhetsregisteret/api/enheter";
 const endpoint=/^\d{9}$/.test(numeric)?
  base+"/"+numeric:base+"?"+new URLSearchParams({navn:query,size:"10",page:"0"}).toString();
 let response;
 try{response=await fetcher(endpoint,{headers:{Accept:"application/json"},
  signal:AbortSignal.timeout(6500),cache:"no-store"});}
 catch{throw Error("Kunne ikke kontakte Brønnøysundregistrene. Prøv igjen.");}
 if(response.status===404)return [];
 if(!response.ok)throw Error("Brønnøysundregistrene svarte ikke. Prøv igjen.");
 const size=Number(response.headers?.get?.("content-length")||0);
 if(size>250000)throw Error("For stort svar fra bedriftsregisteret.");
 let data;
 try{data=await response.json();}catch{throw Error("Brønnøysundregistrene sendte ugyldig data.");}
 const records=/^\d{9}$/.test(numeric)?[data]:data?._embedded?.enheter;
 if(!Array.isArray(records))throw Error("Kunne ikke lese søkeresultatet fra bedriftsregisteret.");
 return records.slice(0,10).map(mapBrregCompany).filter(Boolean);
}
