"use client";
import {useEffect,useState} from "react";

const actionStyle={padding:"11px 14px",borderRadius:9,minHeight:44,
 fontSize:15,fontWeight:750,background:"#e9f1f8",color:"#18374f",
 border:"1.5px solid #7892a6",width:"fit-content",maxWidth:"100%"};

export default function ExternalInvoicePdfAttachmentPanel({invoiceId,invoiceNumber}){
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [data,setData]=useState(null),[error,setError]=useState("");
 const [info,setInfo]=useState("");
 const endpoint="/api/admin/invoices/external-register/tripletex/attachment";
 const refresh=async()=>{
  const response=await fetch(endpoint+"?id="+encodeURIComponent(invoiceId),{cache:"no-store"});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.ok)throw Error(body.error||"Vedleggsstatus kunne ikke leses.");
  setData(body);return body;
 };
 useEffect(()=>{
  let active=true;setLoading(true);setError("");setInfo("");
  fetch(endpoint+"?id="+encodeURIComponent(invoiceId),{cache:"no-store"})
   .then(async res=>{
    const body=await res.json().catch(()=>({}));
    if(!res.ok||!body.ok)throw Error(body.error||"Kunne ikke lese PDF-status.");
    if(active)setData(body);
   }).catch(e=>{if(active)setError(e.message)})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[invoiceId]);
 const upload=async()=>{
  if(busy||!data?.eligible||data.state!=="not_uploaded")return;
  if(!window.confirm("Legge original-PDF for faktura "+invoiceNumber+
   " ved det EKSISTERENDE bilaget i Tripletex?\n\n"+
   "Kontroller først at dette dokumentet IKKE allerede er vedlagt manuelt. "+
   "Dette oppretter ingen ny faktura, betaling eller bokføring, og sender ingen faktura til kunden. "+
   "Et uavklart opplastingsforsøk kan ikke gjentas automatisk."))return;
  setBusy(true);setError("");setInfo("");
  try{
   const response=await fetch(endpoint,{method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"attach-original-pdf",id:invoiceId,
     confirmed:true,checkedTripletex:true})});
   const body=await response.json().catch(()=>({}));
   if(!response.ok||!body.ok)throw Error(body.error||"Vedlegget kunne ikke bekreftes.");
   setInfo(body.message||"Original-PDF vedlagt eksisterende bilag i Tripletex.");
   await refresh();
  }catch(e){
   setError(e.message||"Resultatet er uavklart. Kontroller Tripletex.");
   try{await refresh()}catch{}
  }finally{setBusy(false)}
 };
 return <div style={{border:"1px solid #a4b4c2",borderRadius:10,
  padding:14,display:"grid",gap:10,background:"#f7f9fc",color:"#192b3b"}}>
  <strong style={{fontSize:16}}>Original-PDF på Tripletex-bilaget</strong>
  {loading&&<p role="status" style={{margin:0}}>Henter dokumentstatus …</p>}
  {error&&<p role="alert" style={{margin:0,color:"#922c2c"}}>{error}</p>}
  {info&&<p role="status" style={{margin:0}}>{info}</p>}
  {data?.state==="confirmed"&&<p role="status" style={{margin:0}}>
   ✓ Original-PDF er registrert som vedlagt eksisterende Tripletex-bilag
   {data.voucherId?" "+data.voucherId:""}. Ingen ny faktura eller betaling er opprettet.
  </p>}
  {data?.state==="needs_review"||data?.state==="uploading"?<p role="alert"
   style={{margin:0,color:"#922c2c"}}>
   Et PDF-forsøk er uavklart. Kontroller eksisterende bilag i Tripletex.
   Automatisk gjentakelse er sperret for å hindre duplikater.
  </p>:null}
  {data&&!data.eligible&&data.state==="not_uploaded"&&<p role="status"
   style={{margin:0}}>{data.reason||"PDF-originalen er ikke klar for opplasting."}</p>}
  {data?.eligible&&data.state==="not_uploaded"&&<>
   <p style={{margin:0,fontSize:14}}>
    Originalen <strong>{data.originalFilename}</strong> lagres privat hos Aadland Service.
    Knappen legger den ved riktig eksisterende regnskapsbilag, ikke som en ny faktura.
   </p>
   <button type="button" style={actionStyle} disabled={busy}
    onClick={upload}>{busy?"Kontrollerer og legger ved …":"Legg original-PDF ved Tripletex-bilaget"}</button>
  </>}
 </div>;
}
