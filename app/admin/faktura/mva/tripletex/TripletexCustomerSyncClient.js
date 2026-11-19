"use client";
import {useMemo,useState} from "react";
import styles from "./TripletexReceipts.module.css";

const endpoint="/api/admin/tripletex/customers";
const eligible=c=>c.status==="pending"&&Boolean(String(c.name||"").trim());

export default function TripletexCustomerSyncClient(){
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false),[busyId,setBusyId]=useState("");
 const [customers,setCustomers]=useState([]),[error,setError]=useState("");
 const [notice,setNotice]=useState(""),[query,setQuery]=useState("");
 const [showLinked,setShowLinked]=useState(false);
 const [editing,setEditing]=useState(null);
 const pending=customers.filter(x=>x.status!=="linked");
 const corrections=customers.filter(x=>x.status==="linked"&&x.needsUpdate);
 const searchable=useMemo(()=>customers.filter(x=>(showLinked||x.status!=="linked"||x.needsUpdate)&&
  [x.name,x.email,x.organizationNumber].some(s=>String(s||"").toLocaleLowerCase("nb-NO")
   .includes(query.toLocaleLowerCase("nb-NO")))),[customers,showLinked,query]);
 async function load(){
  setLoading(true);setError("");
  try{
   const response=await fetch(endpoint,{cache:"no-store"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"Kunne ikke hente kunderegisteret.");
   setCustomers(data.customers||[]);
  }catch(e){setError(e.message||"Kunne ikke hente kunderegisteret.")}
  finally{setLoading(false);}
 }
 function toggle(){
  if(!open)load();
  setOpen(!open);
 }
 async function transferOne(customer,action="transfer"){
  const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({sourceType:customer.sourceType,sourceId:customer.id,action})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   if(data.status==="needs_review")setCustomers(prev=>prev.map(x=>
    x.id===customer.id&&x.sourceType===customer.sourceType?{...x,status:"needs_review"}:x));
   throw Error(data.error||"Overføringen feilet.");
  }
  setCustomers(prev=>prev.map(x=>x.id===customer.id&&x.sourceType===customer.sourceType?
   {...x,status:"linked",needsUpdate:false,tripletexCustomerId:data.tripletexCustomerId}:x));
  return data;
 }
 async function single(customer,action="transfer"){
  if(busy||loading)return;
  if(action==="transfer"&&!window.confirm("Overføre "+customer.name+
   " til din ekte Tripletex-konto? Nye kunder opprettes bare hvis de ikke finnes fra før."+
   (!customer.email?"\n\nE-post er ikke oppgitt. Det opprettes ikke en falsk e-postadresse.":"")))return;
  if(action==="update"&&!window.confirm(
   "Send oppdaterte kundeopplysninger for "+customer.name+
   " til samme kunde i Tripletex? Ingen ny kunde opprettes."))return;
  if(action==="retryUpdate"&&!window.confirm(
   "Kontroller først kunden i Tripletex. Vil du forsøke å sende korrigeringen på nytt til samme kunde-ID?"))return;
  if(action==="retryCreate"&&!window.confirm(
   "Vi kontrollerer først om "+customer.name+
   " finnes i Tripletex. Bare hvis ingen tilsvarende kunde finnes, forsøker vi opprettelse på nytt. "+
   "Ingen fakturaer blir sendt. Fortsette?"))return;
  setBusy(true);setBusyId(customer.sourceType+":"+customer.id);setError("");setNotice("");
  try{
   const result=await transferOne(customer,action);
   setNotice(customer.name+(result.updated?
     (result.unchanged?" har ingen nye opplysninger som må korrigeres.":" er oppdatert i Tripletex."):
     result.existing?" er koblet til eksisterende kunde i Tripletex.":" er opprettet i Tripletex.")+
     (result.warnings?.length?" "+result.warnings.join(" "):""));
  }catch(e){setError(e.message||"Kundeoverføringen feilet.")}
  finally{setBusy(false);setBusyId("");}
 }
 async function transferAll(){
  if(busy||loading)return;
  const batch=pending.filter(eligible);
  if(!batch.length)return;
  const withoutEmail=batch.filter(customer=>!customer.email).length;
  if(!window.confirm("Overføre "+batch.length+" kunder til den ekte Tripletex-kontoen?\n\n"+
    (withoutEmail?withoutEmail+" kunder mangler e-post og overføres med tomt e-postfelt.\n\n":"")+
    "Eksisterende kunder kontrolleres før nye opprettes. Kontroller at listen ikke inneholder testkunder. "+
    "Ingen fakturaer bokføres."))return;
  setBusy(true);setBusyId("all");setError("");setNotice("");
  let transferred=0,problems=0;
  for(const customer of batch){
   try{await transferOne(customer);transferred++;}
   catch{problems++;}
  }
  setNotice(transferred+" kunder er koblet til Tripletex."+
   (problems?" "+problems+" krever kontroll; ingen automatisk gjentakelse.":""));
  setBusy(false);setBusyId("");
  await load();
 }
 async function updateAll(){
  if(busy||loading||!corrections.length)return;
  if(!window.confirm("Oppdatere "+corrections.length+
   " eksisterende kunder i Tripletex? Ingen nye kunder opprettes."))return;
  setBusy(true);setBusyId("updates");setError("");setNotice("");
  let done=0,failed=0;
  for(const customer of corrections){
   try{await transferOne(customer,"update");done++;}
   catch{failed++;}
  }
  setBusy(false);setBusyId("");
  setNotice(done+" kunder er oppdatert."+(failed?" "+failed+" må kontrolleres.":""));
  await load();
 }
 async function saveProfile(){
  if(!editing||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({...editing,action:"saveProfile"})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"Kundekortet kunne ikke lagres.");
   setEditing(null);
   setNotice("Kundekortet er lagret i Aadland Service. Bruk «Oppdater i Tripletex» for å sende rettelsen.");
   await load();
  }catch(e){setError(e.message||"Kundekortet kunne ikke lagres.");}
  finally{setBusy(false);}
 }
 return <div style={{borderTop:"1px solid #e3dfd9",paddingTop:14,marginTop:16}}>
  <div className={styles.actions}>
   <button type="button" className={styles.primary} onClick={toggle} disabled={busy}>
    {open?"Skjul kundeoverføring":"Overfør kunder til Tripletex"}
   </button>
  </div>
  {open&&<div style={{marginTop:12}}>
   <p className={styles.hint}>Kundene hentes fra kunderegisteret i Aadland Service.
    Allerede overførte kunder fjernes fra listen over dem som gjenstår.
    Nye kunder blir først kontrollert mot Tripletex for å unngå duplikater.
    <strong> Kunder kan overføres med bare navn, og kontaktopplysninger kan fylles inn senere.</strong>
    Oppdater kundekortet i Aadland Service og send deretter en korrigering til samme kunde i Tripletex.
    <strong> Ingen fakturaer opprettes ved kundeoverføring.</strong>
    Har en overføring stoppet, bruk «Kontroller og prøv igjen». Den søker etter kunden i Tripletex før en eventuell ny opprettelse.</p>
   {loading&&<p role="status">Henter kunder …</p>}
   {error&&<p className={styles.error} role="alert">{error}</p>}
   {notice&&<p className={styles.progress} role="status">{notice}</p>}
   {!loading&&<div className={styles.actions}>
    <button type="button" className={styles.primary}
     onClick={transferAll} disabled={busy||!pending.some(eligible)}>
     {busyId==="all"?"Overfører …":"Overfør alle nye kunder ("+pending.filter(eligible).length+")"}
    </button>
    <button type="button" disabled={busy||!corrections.length} onClick={updateAll}>
     {busyId==="updates"?"Oppdaterer …":"Send alle korrigeringer ("+corrections.length+")"}
    </button>
    <button type="button" disabled={busy} onClick={load}>Oppdater listen</button>
   </div>}
   <p className={styles.hint}>{pending.length} nye/uavklarte · {corrections.length} har endringer som kan sendes ·
    {customers.length-pending.length} koblet til Tripletex</p>
   <div className={styles.inputs}>
    <label>Søk etter kunde
     <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
      placeholder="Navn, e-post eller org.nr." disabled={busy}/>
    </label>
   </div>
   <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,margin:"12px 0"}}>
    <input type="checkbox" checked={showLinked} onChange={e=>setShowLinked(e.target.checked)}/>
    Vis også overførte kunder uten nye endringer
   </label>
   <div style={{maxHeight:360,overflowY:"auto",borderTop:"1px solid #e3dfd9"}}>
    {searchable.map(customer=><div key={customer.sourceType+":"+customer.id}
     style={{display:"flex",gap:12,justifyContent:"space-between",alignItems:"center",
      padding:"11px 2px",borderBottom:"1px solid #eee8df",flexWrap:"wrap"}}>
     <div style={{minWidth:0,overflowWrap:"anywhere"}}>
      <strong>{customer.name}</strong>
      <div className={styles.hint} style={{margin:"3px 0",fontSize:12}}>
       {customer.hasDetails?[customer.organizationNumber?"Org.nr. "+customer.organizationNumber:null,
        customer.email||"E-post ikke oppgitt",customer.hasPhone?"Telefon registrert":null]
         .filter(Boolean).join(" · "):"Kun navn – kontaktopplysninger kan fylles inn senere"}
       {" · "}{customer.status==="linked"?
        (customer.needsUpdate?"Endret – kan korrigeres":"Overført ✓"):
       customer.status==="needs_review"?"Krever kontroll":
       customer.status==="processing"?"Uavklart / pågår":"Ikke overført"}
      </div>
     </div>
     <div className={styles.actions} style={{margin:0}}>
      {customer.status==="pending"?
       <button type="button" disabled={busy||!eligible(customer)}
        onClick={()=>single(customer)}>
        {busyId===customer.sourceType+":"+customer.id?"Overfører …":"Overfør"}
       </button>:
       customer.status==="linked"&&customer.needsUpdate?
       <button type="button" disabled={busy}
        onClick={()=>single(customer,"update")}>Oppdater i Tripletex</button>:
       customer.status==="needs_review"&&customer.tripletexCustomerId?
       <button type="button" disabled={busy}
        onClick={()=>single(customer,"retryUpdate")}>Prøv korrigering igjen</button>:
       customer.status==="needs_review"?
       <button type="button" disabled={busy}
        onClick={()=>single(customer,"retryCreate")}>Kontroller og prøv igjen</button>:
       customer.status==="processing"?
       <span className={styles.hint}>Pågår – oppdater listen</span>:
       null}
      {customer.sourceType==="contact"?
       <a href={"/admin/kunder/"+encodeURIComponent(customer.id)}
        style={{fontSize:13}}>Rett kundekort</a>:
       <button type="button" disabled={busy}
        onClick={()=>setEditing({sourceType:"profile",sourceId:customer.id,updatedAt:customer.updatedAt,
         name:customer.name,phone:customer.phone||"",address:customer.address||""})}>
        Rett kundekort
       </button>}
     </div>
     {editing?.sourceId===customer.id&&<div style={{width:"100%",display:"grid",gap:8}}>
      <p className={styles.hint}>Kundekonto: E-post er knyttet til innlogging og endres ikke her.</p>
      <label>Navn <input value={editing.name} onChange={e=>setEditing(x=>({...x,name:e.target.value}))}/></label>
      <label>Telefon <input value={editing.phone} onChange={e=>setEditing(x=>({...x,phone:e.target.value}))}/></label>
      <label>Adresse <input value={editing.address} onChange={e=>setEditing(x=>({...x,address:e.target.value}))}/></label>
      <div className={styles.actions}>
       <button type="button" disabled={busy} onClick={saveProfile}>Lagre kundekort</button>
       <button type="button" disabled={busy} onClick={()=>setEditing(null)}>Avbryt</button>
      </div>
     </div>}
    </div>)}
    {!searchable.length&&!loading&&<p className={styles.hint}>Ingen kunder i dette utvalget.</p>}
   </div>
  </div>}
 </div>;
}
