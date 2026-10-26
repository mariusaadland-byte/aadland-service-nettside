"use client";
import {useEffect,useState} from "react";
export default function CompanyRegistrySearch({onSelect,onUseExisting,checkExisting=false,disabled=false,initialQuery=""}){
 const [query,setQuery]=useState(initialQuery),[results,setResults]=useState([]);
 const [loading,setLoading]=useState(false),[checking,setChecking]=useState(false);
 const [error,setError]=useState(""),[selected,setSelected]=useState(null),[existingCustomer,setExistingCustomer]=useState(null);
 useEffect(()=>{
  const q=query.trim();
  if(q.length<3||disabled||selected?.name===q){setResults([]);setLoading(false);setError("");return;}
  let active=true;const controller=new AbortController();
  const timeout=setTimeout(async()=>{
   setLoading(true);setError("");
   try{
    const response=await fetch("/api/admin/company-lookup?q="+encodeURIComponent(q),
     {cache:"no-store",signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||"Kunne ikke søke etter firma.");
    if(active)setResults(data.companies||[]);
   }catch(e){
    if(active&&!controller.signal.aborted){setResults([]);setError(e.message||"Søket mislyktes.");}
   }finally{if(active)setLoading(false);}
  },400);
  return()=>{active=false;clearTimeout(timeout);controller.abort();};
 },[query,disabled,selected?.organizationNumber]);
 async function pick(company){
  if(disabled||checking)return;
  setError("");setExistingCustomer(null);
  if(checkExisting){
   setChecking(true);
   try{
    const response=await fetch("/api/admin/customer-contacts?organizationNumber="+encodeURIComponent(company.organizationNumber),
     {cache:"no-store"});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||"Eksisterende kunderegister kunne ikke kontrolleres.");
    if(result.contact){
     setExistingCustomer(result.contact);
     setSelected(company);setQuery(company.name);setResults([]);
     return;
    }
   }catch(e){
    setError(e.message||"Kunne ikke kontrollere om kunden finnes fra før.");
    return; // Fail closed: do not suggest duplicate when lookup failed.
   }finally{setChecking(false);}
  }
  onSelect?.(company);setSelected(company);
  setQuery(company.name);setResults([]);
 }
 return <section style={{background:"#f1f6f2",padding:14,borderRadius:10,margin:"10px 0"}}>
  <strong>Søk etter firma – fyll inn kundedata automatisk</strong>
  <p style={{fontSize:13,margin:"6px 0 10px"}}>Søk med firmanavn eller organisasjonsnummer.
   Navn, adresse og org.nr. hentes fra Brønnøysundregistrene (offisielle data også brukt av bedriftskataloger).
   E-post, telefon og kontaktperson må kontrolleres eller fylles inn.</p>
  <label style={{display:"grid",gap:5}}>Finn registrert bedrift
   <input type="search" value={query} autoComplete="off" disabled={disabled||checking}
    placeholder="Skriv firmanavn eller 9-sifret org.nr."
    onChange={e=>{setQuery(e.target.value);setSelected(null);setExistingCustomer(null);}}/>
  </label>
  {loading&&<p role="status" style={{fontSize:13}}>Søker i Enhetsregisteret …</p>}
  {checking&&<p role="status" style={{fontSize:13}}>Kontrollerer om bedriften allerede er kunde …</p>}
  {error&&<p role="alert" style={{color:"#aa2a20",fontSize:13}}>{error}</p>}
  {!loading&&!error&&query.trim().length>=3&&results.length===0&&!selected&&
   <p style={{fontSize:13}}>Ingen treff ennå. Prøv hele firmanavnet eller organisasjonsnummer.</p>}
  {results.length>0&&<div role="group" aria-label="Firmaer fra Brønnøysundregistrene"
   style={{display:"grid",gap:7,marginTop:10,maxHeight:280,overflowY:"auto"}}>
   {results.map(company=><button type="button" disabled={disabled||checking}
    key={company.organizationNumber} onClick={()=>pick(company)}
    style={{textAlign:"left",background:"#fff",border:"1px solid #cbd6cf",borderRadius:8,
     padding:11,whiteSpace:"normal"}}>
     <strong>{company.name}</strong>
     <small style={{display:"block",marginTop:3}}>Org.nr. {company.organizationNumber}
      {company.businessForm?" · "+company.businessForm:""}
      {" · "}{company.registeredForVat?"MVA-registrert":"Ikke registrert i MVA-registeret"}
     </small>
     {company.address&&<small style={{display:"block",whiteSpace:"pre-line"}}>{company.address}</small>}
     {company.businessStatus&&<small style={{display:"block",color:"#ad3026"}}>{company.businessStatus}</small>}
   </button>)}
  </div>}
  {existingCustomer&&<div role="status" style={{background:"#fff1d8",borderRadius:9,padding:12,marginTop:10}}>
   <strong>Bedriften finnes allerede i kunderegisteret.</strong>
   <p style={{fontSize:13,margin:"7px 0"}}>{existingCustomer.name} · Org.nr. {existingCustomer.organizationNumber}
    {existingCustomer.address&&<span style={{display:"block",whiteSpace:"pre-wrap"}}>{existingCustomer.address}</span>}
   </p>
   {onUseExisting&&<button type="button" disabled={disabled||checking} onClick={()=>onUseExisting(existingCustomer)}>
    Bruk eksisterende kundekort
   </button>}
   {!onUseExisting&&<a style={{display:"block",marginTop:6}}
    href={"/admin/kunder/"+encodeURIComponent(existingCustomer.id)}>Åpne kundekort</a>}
   <p style={{fontSize:12,margin:"8px 0 0"}}>Det opprettes ikke et nytt kundekort. Eksisterende kontaktopplysninger blir beholdt.</p>
  </div>}
  {selected&&!existingCustomer&&<p role="status" style={{fontSize:13,marginBottom:0}}>
   <strong>Valgt:</strong> {selected.name} · {selected.organizationNumber}.
   {" "}Kontroller fakturaadresse og kontaktinformasjon før lagring.
   <a style={{marginLeft:8}} target="_blank" rel="noopener noreferrer"
    href={"https://virksomhet.brreg.no/nb/oppslag/enheter/"+selected.organizationNumber}>Se offisiell registrering</a>
  </p>}
 </section>;
}
