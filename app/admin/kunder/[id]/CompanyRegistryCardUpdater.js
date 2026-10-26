"use client";
import {useState} from "react";
import CompanyRegistrySearch from "../CompanyRegistrySearch";
import {compareCompanyRegistryCard,applyCompanyRegistryCard} from "../../../../lib/companyRegistryPatch";

export default function CompanyRegistryCardUpdater({form,onApply,disabled=false}){
 const [open,setOpen]=useState(false),[candidate,setCandidate]=useState(null);
 const [fields,setFields]=useState([]),[allowOtherCompany,setAllowOtherCompany]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const preview=candidate?compareCompanyRegistryCard(form,candidate):null;
 const changed=preview?.comparisons.filter(item=>item.changed&&item.available)||[];
 function receive(company){
  const result=compareCompanyRegistryCard(form,company);
  setCandidate(company);
  setFields(result.comparisons.filter(item=>item.changed&&item.available).map(item=>item.key));
  setAllowOtherCompany(false);
  setNotice("");setError("");
 }
 function apply(){
  setError("");
  try{
   const next=applyCompanyRegistryCard(form,candidate,fields,{
    confirmCompanyMismatch:allowOtherCompany
   });
   onApply(next);
   setNotice("Opplysningene er lagt i skjemaet, men er IKKE lagret ennå. Kontroller og trykk «Lagre kundekort» nederst.");
   setCandidate(null);setOpen(false);
  }catch(e){setError(e.message||"Kunne ikke overføre firmaopplysningene.");}
 }
 return <section style={{margin:"14px 0",padding:14,border:"1px solid #d6d1bf",borderRadius:10}}>
  <h2 style={{fontSize:17,margin:"0 0 6px"}}>Oppdater firma fra Brønnøysundregistrene</h2>
  <p style={{fontSize:13,margin:"0 0 11px"}}>
   Hent navn, organisasjonsnummer og registrert adresse. Dine egne opplysninger om e-post,
   telefon, kontaktperson, betalingsfrist og notater blir bevart.
  </p>
  {!open&&<button type="button" disabled={disabled} onClick={()=>{setOpen(true);setNotice("");}}>
   Søk etter oppdaterte firmaopplysninger
  </button>}
  {open&&<>
   <CompanyRegistrySearch disabled={disabled} initialQuery={form.organizationNumber||form.name}
    onSelect={receive}/>
   {preview&&<div style={{padding:"12px 0"}}>
    <h3 style={{fontSize:16,margin:"0 0 10px"}}>Kontroller før overføring</h3>
    <p style={{fontSize:13}}>{preview.warning}</p>
    {preview.companyMismatch&&<label style={{display:"block",background:"#fff2df",padding:10,borderRadius:8,marginBottom:11}}>
     <input type="checkbox" checked={allowOtherCompany} onChange={e=>setAllowOtherCompany(e.target.checked)}/>
     Jeg bekrefter at kundekortet skal bytte til en annen bedrift med nytt organisasjonsnummer.
    </label>}
    <div style={{display:"grid",gap:10}}>
     {preview.comparisons.map(item=><label key={item.key}
      style={{display:"flex",alignItems:"flex-start",gap:10,borderBottom:"1px solid #eee",paddingBottom:10}}>
      <input type="checkbox" disabled={!item.changed||!item.available||disabled}
       checked={fields.includes(item.key)} onChange={e=>setFields(old=>
        e.target.checked?[...old,item.key]:old.filter(key=>key!==item.key))}/>
      <span style={{flex:1,minWidth:0}}>
       <strong>{item.label}</strong>
       <small style={{display:"block",whiteSpace:"pre-wrap",marginTop:3}}>
        Nå: {item.current||"(tomt)"}
       </small>
       <small style={{display:"block",whiteSpace:"pre-wrap",marginTop:3}}>
        Fra registeret: {item.proposed||"(ikke tilgjengelig)"}
       </small>
       {!item.changed&&<small style={{display:"block"}}>Ingen endring</small>}
      </span>
     </label>)}
    </div>
    <p style={{fontSize:13,marginTop:10}}>
     Du velger selv feltene som overføres. Endringene er ikke lagret før kundekortet lagres.
    </p>
    <button type="button" disabled={disabled||fields.length===0||
     (preview.companyMismatch&&!allowOtherCompany)} onClick={apply}>
     Bruk valgte opplysninger i skjema
    </button>
   </div>}
   <button type="button" disabled={disabled} style={{margin:"10px 0"}}
    onClick={()=>{setOpen(false);setCandidate(null);setError("");}}>Lukk firmasøk</button>
  </>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  {notice&&<p role="status" style={{fontSize:13,color:"#27523f"}}>{notice}</p>}
 </section>;
}
