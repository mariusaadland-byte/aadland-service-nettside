"use client";
import {useCallback,useEffect,useState} from "react";

const statusNames={
 queued:"I kø – ennå ikke sendt",
 claimed:"Utsending startet – status må bekreftes",
 needs_review:"Uavklart – kontroller Resend manuelt",
 sent:"Resend har bekreftet mottak av utsendingen"
};
const time=value=>value?new Date(value).toLocaleString("nb-NO"):"–";
const addressKind=value=>value==="owner"?"Bedriften":"Kunden";

export default function QuoteResponseDeliveryPanel({quoteId}){
 const [data,setData]=useState(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  const response=await fetch("/api/admin/quotes/response-notifications?id="+encodeURIComponent(quoteId),{cache:"no-store"});
  const json=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(json.error||"Kunne ikke lese utsendingsstatus.");
  setData(json);
 },[quoteId]);
 useEffect(()=>{
  let active=true;
  setData(null);setError("");setNotice("");
  fetch("/api/admin/quotes/response-notifications?id="+encodeURIComponent(quoteId),{cache:"no-store"})
   .then(async res=>{const j=await res.json().catch(()=>({}));if(!res.ok)throw Error(j.error||"Kunne ikke hente status.");return j;})
   .then(j=>{if(active)setData(j)})
   .catch(err=>{if(active)setError(err.message||"Status mangler.");});
  return()=>{active=false;};
 },[quoteId]);
 async function review(row,action){
  const approve=action==="confirm_sent",phrase=approve?"BEKREFTET I RESEND":"IKKE SENDT";
  const typed=window.prompt(
   approve?
    "Sjekk faktisk meldings-ID i Resend. Skriv BEKREFTET I RESEND for å registrere at e-posten ble akseptert. Ingen e-post sendes.":
    "Kontroller Resend-loggen grundig. Skriv IKKE SENDT bare når du har bekreftet at meldingen ikke ble sendt. Neste automatiske jobb kan sende den i etterkant.\n\nSkriv IKKE SENDT:"
  );
  if(typed!==phrase)return;
  const providerEmailId=approve?window.prompt("Lim inn den bekreftede meldings-ID-en fra Resend:"):"";
  if(approve&&!providerEmailId)return;
  const note=window.prompt("Skriv en konkret begrunnelse (minst 12 tegn), hva du har kontrollert i Resend:")||"";
  if(note.trim().length<12)return;
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/admin/quotes/response-notifications",{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     notificationId:row.id,action,confirmation:typed,quoteNumber:data.quoteNumber,
     providerEmailId,note:note.trim()
    })
   });
   const json=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(json.error||"Avstemming feilet.");
   setNotice(json.message||"Status ble oppdatert.");
   await load();
  }catch(err){setError(err.message||"Avstemming feilet.");}
  finally{setBusy(false);}
 }
 return <section className="card" style={{margin:"16px 0",padding:18}}>
  <h2 style={{margin:"0 0 9px",fontSize:19}}>Bekreftelse etter tilbudssvar</h2>
  <p className="muted">Tilbudets svar og e-postene behandles separat. Denne oversikten endrer aldri godkjenningen, fakturaen eller avtalen. «Bekreftet av Resend» er ikke det samme som dokumentert levering til innboksen.</p>
  {error&&<p role="alert" style={{padding:10,border:"1px solid #bc7771",borderRadius:7}}>{error}</p>}
  {notice&&<p role="status" style={{padding:10,background:"#e6f0e4",color:"#244727",borderRadius:7}}>{notice}</p>}
  {!data&&!error&&<p>Laster e-poststatus …</p>}
  {data?.historicalNoLog&&<p role="status" style={{padding:10,background:"#fff2dc",color:"#654419",borderRadius:7}}>Dette tilbudet ble behandlet før den nye bekreftelsesloggen ble etablert. Historisk e-postlevering er ikke verifisert, og systemet sender ikke automatisk en ny bekreftelse.</p>}
  {(data?.notifications||[]).map(row=><div key={row.id} style={{marginTop:10,border:"1px solid #e1d9cd",borderRadius:9,padding:12}}>
   <strong>{addressKind(row.recipient_kind)}</strong>
   <div style={{fontSize:13,overflowWrap:"anywhere",margin:"5px 0"}}>{row.recipient_email}</div>
   <div><strong>{statusNames[row.state]||"Ukjent status"}</strong></div>
   <small style={{display:"block",margin:"5px 0"}}>Hendelse: {time(row.created_at)} · Forsøk: {row.attempt_number}{row.sent_at?" · Bekreftet: "+time(row.sent_at):""}</small>
   {row.provider_email_id&&<small style={{display:"block",overflowWrap:"anywhere"}}>Resend-ID: {row.provider_email_id}</small>}
   {["needs_review","claimed"].includes(row.state)&&<div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:9}}>
    <button type="button" className="btn alt" disabled={busy} onClick={()=>review(row,"confirm_sent")}>Bekreft sendt i Resend</button>
    <button type="button" className="btn alt" disabled={busy} onClick={()=>review(row,"release_unsent")}>Bekreft ikke sendt – legg i kø</button>
   </div>}
  </div>)}
  {data&&<button type="button" className="btn alt" style={{marginTop:12}} disabled={busy} onClick={()=>load().catch(e=>setError(e.message))}>{busy?"Kontrollerer …":"Oppdater sendestatus"}</button>}
 </section>;
}
