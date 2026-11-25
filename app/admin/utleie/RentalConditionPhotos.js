"use client";
import {useEffect,useRef,useState} from "react";
export default function RentalConditionPhotos({booking,canUpdate}){
 const [groups,setGroups]=useState({before:[],after:[]});
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[opened,setOpened]=useState(false);
 const lock=useRef(false);
 async function load(){
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/admin/rental-condition-photos?bookingId="+encodeURIComponent(booking.id),{cache:"no-store"});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(d.error||"Bildene kunne ikke lastes.");
   setGroups(d.groups||{before:[],after:[]});
  }catch(e){setError(e.message);setGroups({before:[],after:[]});}
  finally{setLoading(false);}
 }
 useEffect(()=>{if(opened)load()},[opened,booking.id]);
 async function upload(phase,files){
  if(lock.current||!files.length)return;
  lock.current=true;setBusy(true);setError("");
  let saved=0;
  try{
   for(const file of files){
    if(file.size>4*1024*1024)throw Error("Bildet er over 4 MB. Velg et mindre bilde.");
    const form=new FormData();form.append("bookingId",booking.id);form.append("phase",phase);form.append("file",file);
    const r=await fetch("/api/admin/rental-condition-photos",{method:"POST",body:form});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||"Bildet kunne ikke lagres.");
    saved++;
   }
   await load();
  }catch(e){await load();setError(saved+" av "+files.length+" bilder behandlet. "+e.message);}
  finally{lock.current=false;setBusy(false);}
 }
 return <section className="orderPaymentPanel">
  <h4>Tilstandsbilder – utlevering og retur</h4>
  <p className="muted">Private bilder av utstyret. Unngå ansikter, legitimasjon og andre personopplysninger. Maks 4 MB per bilde. Bildene endrer ikke status eller depositum.</p>
  {!opened?<button type="button" className="btn alt" onClick={()=>setOpened(true)}>Åpne bildedokumentasjon</button>:<>
   <button type="button" className="btn alt" disabled={loading||busy} onClick={load}>Oppdater bilder / visningslenker</button>
   {loading&&<p role="status">Henter bilder …</p>}
   {error&&<p className="notice" role="alert">{error}</p>}
   {["before","after"].map(phase=>{
    const allowed=canUpdate&&!booking.archivedAt&&(phase==="before"?booking.status==="confirmed":["active","returned"].includes(booking.status));
    return <div key={phase} style={{marginTop:18}}>
     <h4>{phase==="before"?"Før utlevering":"Ved tilbakelevering"} ({groups[phase]?.length||0})</h4>
     {allowed&&<div className="field">
      <label>Ta bilde med kamera<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy||loading} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";upload(phase,files)}}/></label>
      <label>Velg bilder fra telefonen<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||loading} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";upload(phase,files)}}/></label>
     </div>}
     {busy&&<p role="status">Lagrer bilder …</p>}
     <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8}}>
      {(groups[phase]||[]).map(x=><div key={x.id}>{x.url?<a href={x.url} target="_blank" rel="noopener noreferrer"><img src={x.url} referrerPolicy="no-referrer" alt={phase==="before"?"Utstyr før utlevering":"Utstyr ved retur"} style={{width:"100%",height:130,objectFit:"contain"}}/></a>:<p>Visningslenken er utilgjengelig. Oppdater.</p>}<small>{x.createdAt?new Date(x.createdAt).toLocaleString("nb-NO"):""}</small></div>)}
     </div>
    </div>;
   })}
   <p className="muted">Visningslenkene utløper etter fem minutter. Ingen sletting eller overskriving fra denne siden.</p>
  </>}
 </section>;
}
