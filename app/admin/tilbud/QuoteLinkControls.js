"use client";
import {useEffect,useState} from "react";

export default function QuoteLinkControls({quoteId}){
 const [status,setStatus]=useState(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [newLink,setNewLink]=useState("");
 const [copied,setCopied]=useState(false);
 useEffect(()=>{
  let active=true;setStatus(null);setNewLink("");setError("");
  fetch("/api/admin/quotes/link?id="+encodeURIComponent(quoteId),{cache:"no-store"})
   .then(async res=>{
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(data.error||"Lenkestatus kunne ikke hentes.");
    return data;
   }).then(data=>{if(active)setStatus(data)})
   .catch(e=>{if(active)setError(e.message||"Ukjent feil.");});
  return()=>{active=false;};
 },[quoteId]);
 async function update(action){
  const revoking=action==="disable";
  const word=revoking?"SPERR LENKE":"NY LENKE";
  const question=revoking
   ?"Sperre ALLE tidligere offentlige lenker til dette tilbudet? Kunden kan fortsatt se historikken etter innlogging. Skriv SPERR LENKE:"
   :"Sperre den forrige lenken og opprette én ny tidsbegrenset lenke? Ingen e-post sendes automatisk. Skriv NY LENKE:";
  const confirmation=window.prompt(question);
  if(confirmation!==word)return;
  setBusy(true);setError("");setNotice("");setNewLink("");setCopied(false);
  try{
   const res=await fetch("/api/admin/quotes/link",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id:quoteId,action,confirmation})
   });
   const data=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(data.error||"Kunne ikke administrere lenken.");
   setStatus(current=>({...current,enabled:data.enabled,disabledAt:data.disabledAt||null}));
   setNewLink(data.link||"");
   setNotice(revoking?"Tidligere delingslenker er sperret. Tilbudet og regnskapshistorikken er ikke endret.":"Ny lenke er laget. Tidligere delingslenker er ugyldige. Kopier lenken bare til riktig mottaker.");
  }catch(e){setError(e.message||"Lenkehandlingen feilet.");}
  finally{setBusy(false);}
 }
 async function copy(){
  if(!newLink)return;
  try{await navigator.clipboard.writeText(newLink);setCopied(true);}
  catch{setError("Kopiering er ikke tilgjengelig. Marker og kopier lenken i feltet under.");}
 }
 return <section className="card" style={{margin:"16px 0",padding:18}}>
  <h2 style={{margin:"0 0 9px",fontSize:19}}>Kundelenke og personvern</h2>
  <p style={{margin:"0 0 10px"}}>Offentlige tilbudslenker er begrenset til 60 dager og aldri lenger enn tilbudets gyldighetsdato. Kunden kan se sin historikk ved å logge inn på Min side. Ingen handling her sender e-post.</p>
  {error&&<p role="alert" style={{padding:9,border:"1px solid #ce8069",borderRadius:7}}>{error}</p>}
  {!status&&!error&&<p role="status">Henter lenkestatus …</p>}
  {status&&<p role="status"><strong>Delingslenker: {status.enabled?"Aktive (når tilbudet er gyldig)":"Sperret"}</strong>{status.disabledAt?" · Sperret "+new Date(status.disabledAt).toLocaleString("nb-NO"):""}</p>}
  {notice&&<p role="status" style={{padding:9,borderRadius:7,background:"#e8efe5",color:"#194328"}}>{notice}</p>}
  {status&&<div style={{display:"flex",flexWrap:"wrap",gap:10}}>
   {status.canReissue&&<button type="button" className="btn alt" disabled={busy} onClick={()=>update("rotate")}>{busy?"Arbeider …":"Lag ny trygg lenke"}</button>}
   {status.enabled&&<button type="button" className="btn alt" disabled={busy} onClick={()=>update("disable")}>Sperr offentlige lenker</button>}
  </div>}
  {status&&!status.canReissue&&<p style={{fontSize:13}}>En ny lenke kan bare lages mens tilbudet er sendt og gyldig. Et utløpt eller ferdigbehandlet tilbud må håndteres gjennom tilbudshistorikken eller ny revisjon.</p>}
  {newLink&&<div style={{marginTop:12}}>
   <label htmlFor="newSecureQuoteLink" style={{display:"block",fontWeight:700,marginBottom:5}}>Ny lenke – del bare med riktig kunde</label>
   <input id="newSecureQuoteLink" style={{width:"100%",minWidth:0,minHeight:44,padding:9,boxSizing:"border-box"}} readOnly value={newLink} onFocus={e=>e.target.select()}/>
   <button type="button" className="btn alt" style={{marginTop:9}} onClick={copy}>{copied?"Kopiert ✓":"Kopier lenke"}</button>
  </div>}
 </section>;
}
