"use client";
import {useEffect,useState} from "react";
export default function CompanyRegistrySearch({onSelect,disabled=false,initialQuery=""}){
 const [query,setQuery]=useState(initialQuery),[results,setResults]=useState([]);
 const [loading,setLoading]=useState(false),[error,setError]=useState(""),[selected,setSelected]=useState(null);
 useEffect(()=>{
  const q=query.trim();
  if(q.length<3||disabled){setResults([]);setLoading(false);setError("");return;}
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
 },[query,disabled]);
 function pick(company){
  onSelect?.(company);setSelected(company);
  setQuery(company.name);setResults([]);
 }
 return <section style={{background:"#f1f6f2",padding:14,borderRadius:10,margin:"10px 0"}}>
  <strong>Søk etter firma – fyll inn kundedata automatisk</strong>
  <p style={{fontSize:13,margin:"6px 0 10px"}}>Søk med firmanavn eller organisasjonsnummer.
   Navn, adresse og org.nr. hentes fra Brønnøysundregistrene (offisielle data også brukt av bedriftskataloger).
   E-post, telefon og kontaktperson må kontrolleres eller fylles inn.</p>
  <label style={{display:"grid",gap:5}}>Finn registrert bedrift
   <input type="search" value={query} autoComplete="off" disabled={disabled}
    placeholder="Skriv firmanavn eller 9-sifret org.nr."
    onChange={e=>{setQuery(e.target.value);setSelected(null);}}/>
  </label>
  {loading&&<p role="status" style={{fontSize:13}}>Søker i Enhetsregisteret …</p>}
  {error&&<p role="alert" style={{color:"#aa2a20",fontSize:13}}>{error}</p>}
  {!loading&&!error&&query.trim().length>=3&&results.length===0&&!selected&&
   <p style={{fontSize:13}}>Ingen treff ennå. Prøv hele firmanavnet eller organisasjonsnummer.</p>}
  {results.length>0&&<div role="group" aria-label="Firmaer fra Brønnøysundregistrene"
   style={{display:"grid",gap:7,marginTop:10,maxHeight:280,overflowY:"auto"}}>
   {results.map(company=><button type="button" disabled={disabled}
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
  {selected&&<p role="status" style={{fontSize:13,marginBottom:0}}>
   <strong>Valgt:</strong> {selected.name} · {selected.organizationNumber}.
   {" "}Kontroller fakturaadresse og kontaktinformasjon før lagring.
   <a style={{marginLeft:8}} target="_blank" rel="noopener noreferrer"
    href={"https://virksomhet.brreg.no/nb/oppslag/enheter/"+selected.organizationNumber}>Se offisiell registrering</a>
  </p>}
 </section>;
}
