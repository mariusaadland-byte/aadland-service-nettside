"use client";
import {useCallback,useEffect,useState} from "react";

const CONFIRM={sent:"BEKREFTET I RESEND",unsent:"IKKE SENDT"};
export default function CustomerVerificationReview(){
 const [items,setItems]=useState([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");
 const [openId,setOpenId]=useState(null);
 const [outcome,setOutcome]=useState("");
 const [providerId,setProviderId]=useState("");
 const [note,setNote]=useState("");
 const [confirmation,setConfirmation]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const result=await fetch("/api/admin/customer-verifications",{cache:"no-store"});
   const data=await result.json().catch(()=>({}));
   if(!result.ok)throw Error(data.error||"Kunne ikke hente sendeloggen.");
   setItems(Array.isArray(data.attempts)?data.attempts:[]);
  }catch(e){setError(e.message||"Kunne ikke hente sendeloggen.");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{load();},[load]);
 async function review(item){
  if(busy||!item?.id||!CONFIRM[outcome])return;
  if(confirmation!==CONFIRM[outcome]||note.trim().length<12||
   outcome==="sent"&&providerId.trim().length<8){
   setError("Kontroller Resend og fyll ut valgt resultat, begrunnelse, bekreftelsestekst og eventuell e-post-ID.");return;
  }
  setBusy(true);setError("");setSuccess("");
  try{
   const response=await fetch("/api/admin/customer-verifications",{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({attemptId:item.id,outcome,providerId,note,confirmation})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)throw Error(data.error||"Kunne ikke registrere kontrollen.");
   setOpenId(null);setOutcome("");setProviderId("");setNote("");setConfirmation("");
   setSuccess("Kontrollen er registrert. Ingen ny e-post ble sendt.");
   await load();
  }catch(e){setError(e.message||"Kontrollen kunne ikke lagres.");}
  finally{setBusy(false);}
 }
 function selectItem(id){
  setOpenId(current=>current===id?null:id);
  setOutcome("");setProviderId("");setNote("");setConfirmation("");setError("");setSuccess("");
 }
 return <section style={{display:"grid",gap:16,paddingBottom:24}}>
  <h2>Bekreftelsesmailer til nye kunder</h2>
  <p>Her vises usikre sendeforsøk. <strong>Dette panelet sender aldri en ny e-post.</strong>
   Kontroller Resend sin e-posthistorikk og mottaker før du avklarer et forsøk.
   Hvis e-posten ikke ble sendt, kan kunden selv bruke «Send ny bekreftelsesmail» etter kontrollen.</p>
  <button type="button" className="btn alt" onClick={load} disabled={busy||loading}>
   {loading?"Oppdaterer …":"Oppdater sendeloggen"}</button>
  {error&&<p role="alert" className="notice">{error}</p>}
  {success&&<p role="status" className="success">{success}</p>}
  {!loading&&!items.length&&<p>Ingen uavklarte bekreftelsesmailer er registrert.</p>}
  {items.map(item=><div key={item.id} className="card" style={{padding:16}}>
   <strong>{item.recipient_email}</strong>
   <p style={{margin:"8px 0"}}>Forsøk: {new Date(item.claimed_at).toLocaleString("nb-NO")} ·
    {item.state==="needs_review"?" Avventer kontroll":" Utsending pågår eller stoppet"}</p>
   <button type="button" className="btn alt" onClick={()=>selectItem(item.id)} disabled={busy}>
    {openId===item.id?"Lukk kontroll":"Kontroller sendeforsøk"}</button>
   {openId===item.id&&<div style={{display:"grid",gap:12,marginTop:16,maxWidth:650}}>
    <p>Søk opp denne mottakeren og tidspunktet i Resend. Vent minst fem minutter etter forsøket.
     Ikke velg «Ikke sendt» uten at Resend-historikken gir grunnlag for det.</p>
    <label>Kontrollert resultat
     <select value={outcome} onChange={e=>{setOutcome(e.target.value);setConfirmation("");}}>
      <option value="">Velg</option>
      <option value="sent">Resend har akseptert e-posten</option>
      <option value="unsent">Verifisert at e-posten IKKE er sendt</option>
     </select>
    </label>
    {outcome==="sent"&&<label>Resend sin faktiske e-post-ID
     <input value={providerId} onChange={e=>setProviderId(e.target.value)} placeholder="Meldings-ID fra Resend"/>
    </label>}
    <label>Begrunnelse og kontrollgrunnlag (minst 12 tegn)
     <textarea rows={3} value={note} onChange={e=>setNote(e.target.value)}
      placeholder="Hvilken Resend-hendelse ble kontrollert?"/>
    </label>
    <label>Skriv {CONFIRM[outcome]||"bekreftelsen"} for å fullføre
     <input value={confirmation} onChange={e=>setConfirmation(e.target.value)}/>
    </label>
    <button className="btn" type="button" disabled={busy||!outcome}
     onClick={()=>review(item)}>{busy?"Lagrer …":"Lagre kontroll – send ingen e-post"}</button>
   </div>}
  </div>)}
 </section>;
}
