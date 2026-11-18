"use client";
import {useMemo,useState} from "react";
import styles from "./TripletexReceipts.module.css";

const endpoint="/api/admin/tripletex/customers";
const eligible=c=>c.status==="pending"&&Boolean(c.organizationNumber||c.email);

export default function TripletexCustomerSyncClient(){
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false),[busyId,setBusyId]=useState("");
 const [customers,setCustomers]=useState([]),[error,setError]=useState("");
 const [notice,setNotice]=useState(""),[query,setQuery]=useState("");
 const [showLinked,setShowLinked]=useState(false);
 const pending=customers.filter(x=>x.status!=="linked");
 const searchable=useMemo(()=>customers.filter(x=>(showLinked||x.status!=="linked")&&
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
   {...x,status:"linked",tripletexCustomerId:data.tripletexCustomerId}:x));
  return data;
 }
 async function single(customer,action="transfer"){
  if(busy||loading)return;
  if(action==="transfer"&&!window.confirm("Overføre "+customer.name+
   " til din ekte Tripletex-konto? En ny kunde opprettes bare hvis kunden ikke finnes fra før."))return;
  setBusy(true);setBusyId(customer.sourceType+":"+customer.id);setError("");setNotice("");
  try{
   const result=await transferOne(customer,action);
   setNotice(customer.name+(result.existing?" er koblet til eksisterende kunde i Tripletex.":
    " er opprettet i Tripletex."));
  }catch(e){setError(e.message||"Kundeoverføringen feilet.")}
  finally{setBusy(false);setBusyId("");}
 }
 async function transferAll(){
  if(busy||loading)return;
  const batch=pending.filter(eligible);
  if(!batch.length)return;
  if(!window.confirm("Overføre "+batch.length+" kunder til den ekte Tripletex-kontoen?\n\n"+
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
    <strong> Kundeoverføring oppretter aldri fakturaer.</strong></p>
   {loading&&<p role="status">Henter kunder …</p>}
   {error&&<p className={styles.error} role="alert">{error}</p>}
   {notice&&<p className={styles.progress} role="status">{notice}</p>}
   {!loading&&<div className={styles.actions}>
    <button type="button" className={styles.primary}
     onClick={transferAll} disabled={busy||!pending.some(eligible)}>
     {busyId==="all"?"Overfører …":"Overfør alle nye kunder ("+pending.filter(eligible).length+")"}
    </button>
    <button type="button" disabled={busy} onClick={load}>Oppdater listen</button>
   </div>}
   <p className={styles.hint}>{pending.length} gjenstår · {customers.length-pending.length} koblet til Tripletex</p>
   <div className={styles.inputs}>
    <label>Søk etter kunde
     <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
      placeholder="Navn, e-post eller org.nr." disabled={busy}/>
    </label>
   </div>
   <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,margin:"12px 0"}}>
    <input type="checkbox" checked={showLinked} onChange={e=>setShowLinked(e.target.checked)}/>
    Vis også overførte kunder
   </label>
   <div style={{maxHeight:360,overflowY:"auto",borderTop:"1px solid #e3dfd9"}}>
    {searchable.map(customer=><div key={customer.sourceType+":"+customer.id}
     style={{display:"flex",gap:12,justifyContent:"space-between",alignItems:"center",
      padding:"11px 2px",borderBottom:"1px solid #eee8df",flexWrap:"wrap"}}>
     <div style={{minWidth:0,overflowWrap:"anywhere"}}>
      <strong>{customer.name}</strong>
      <div className={styles.hint} style={{margin:"3px 0",fontSize:12}}>
       {customer.organizationNumber||customer.email||"Kontaktopplysninger mangler"}
       {" · "}{customer.status==="linked"?"Overført ✓":
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
       customer.status==="needs_review"?
       <button type="button" disabled={busy}
        onClick={()=>single(customer,"check")}>Kontroller</button>:
       null}
     </div>
    </div>)}
    {!searchable.length&&!loading&&<p className={styles.hint}>Ingen kunder i dette utvalget.</p>}
   </div>
  </div>}
 </div>;
}
