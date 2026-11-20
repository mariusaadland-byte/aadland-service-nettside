"use client";
import {useState} from "react";
const url="/api/admin/invoices/debt-case";
export default function InvoiceDebtCasePanel({invoiceId}){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function load(){
  if(busy)return;
  setBusy(true);setError("");
  try{
   const r=await fetch(url+"?invoiceId="+encodeURIComponent(invoiceId),{cache:"no-store"});
   const payload=await r.json().catch(()=>({}));
   if(!r.ok||!payload.ok)throw Error(payload.error||"Saksgrunnlaget er ikke tilgjengelig.");
   setData(payload.dossier);
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <details style={{margin:"12px 0",padding:14,border:"1px solid #a9b9c8",
  borderRadius:10,color:"#1d3040",background:"#f6f9fb"}}>
  <summary style={{cursor:"pointer",fontWeight:750}}>
   Videre egenoppfølging – internt saksgrunnlag
  </summary>
  <p style={{fontSize:14}}>Samler faktura, betalingshistorikk, kreditnotaer og
   utsendte varsler for manuell vurdering. Ingen ny betalingsoppfordring,
   gebyr, renter, e-post eller inkasso blir opprettet.</p>
  <button type="button" disabled={busy} onClick={load}
   style={{padding:"10px 14px",minHeight:44,borderRadius:8,
    border:"1px solid #7e99aa",background:"#e8f1f7",color:"#1c3850",fontWeight:750}}>
   {busy?"Avstemmer saksgrunnlaget …":"Kontroller og åpne saksgrunnlaget"}
  </button>
  {error&&<p role="alert" style={{color:"#9c3030"}}>{error}</p>}
  {data&&<div style={{marginTop:14,display:"grid",gap:10}}>
   <p role="status" style={{margin:0}}>
    <strong>{data.readyForManualReview?"Klar for manuell gjennomgang":"Må avklares først"}</strong>
    {" · Faktura "+data.invoiceNumber+" · Utestående "}
    {new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"})
     .format(data.outstandingOre/100)}
   </p>
   {data.reasons.length>0&&<ul style={{paddingLeft:22,margin:0}}>
    {data.reasons.map((reason,i)=><li key={i}>{reason}</li>)}
   </ul>}
   <p style={{margin:0,fontSize:13}}>Saksgrunnlaget er kun et internt dokument.
    Det kan ikke sendes som betalingsoppfordring. Kontroller innsigelser,
    bank og gjeldende inkassoregler før videre behandling.</p>
   <a href={url+"?invoiceId="+encodeURIComponent(invoiceId)+"&format=print"}
    target="_blank" rel="noopener noreferrer" style={{fontWeight:750}}>
    Åpne utskriftsvennlig saksoversikt (kan lagres som PDF)
   </a>
  </div>}
 </details>;
}
