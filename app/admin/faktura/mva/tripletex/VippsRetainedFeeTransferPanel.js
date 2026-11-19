"use client";
import {useState} from "react";

const kr=ore=>new Intl.NumberFormat("nb-NO",{
 style:"currency",currency:"NOK"}).format(Number(ore||0)/100);

export default function VippsRetainedFeeTransferPanel({row,unit}){
 const [visible,setVisible]=useState(false),[loading,setLoading]=useState(false);
 const [error,setError]=useState(""),[preview,setPreview]=useState(null);
 const [feeAccount,setFeeAccount]=useState(""),[checked,setChecked]=useState(false);
 const [success,setSuccess]=useState(null);
 if(unit!=="service"||row?.kind!=="trukket"||!row?.pspReference)return null;
 async function review(){
  if(loading)return;
  setVisible(true);setLoading(true);setError("");setPreview(null);
  setSuccess(null);setChecked(false);setFeeAccount("");
  try{
   const params=new URLSearchParams({unit:"service",date:row.date,feeId:row.pspReference});
   const response=await fetch("/api/admin/tripletex/vipps-fees?"+params,{cache:"no-store"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)throw Error(data.error||"Vipps-gebyret kunne ikke kontrolleres.");
   setPreview(data);
   if(data.feeAccounts?.length===1)setFeeAccount(String(data.feeAccounts[0].id));
  }catch(err){setError(err.message||"Kunne ikke kontrollere gebyrbilaget.");}
  finally{setLoading(false);}
 }
 async function transfer(){
  if(loading||!preview?.ready||!feeAccount||!checked)return;
  if(!window.confirm("Bokføre dette gebyret som en kostnad i Tripletex, "+
   "mot Vipps oppgjørskunde 10009 og UTEN bankinnbetaling? "+
   "Du bekrefter at gebyret ikke allerede er bokført."))return;
  setLoading(true);setError("");
  try{
   const response=await fetch("/api/admin/tripletex/vipps-fees",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"record-retained-fee",unit:"service",
     date:row.date,feeId:row.pspReference,
     expectedDigest:preview.digest,feeAccountId:Number(feeAccount),
     confirmed:true,notImportedPreviously:true})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)throw Error(data.error||
    "Bokføringen er uavklart. Ikke prøv igjen før Tripletex er kontrollert.");
   setSuccess(data);setPreview(null);
  }catch(err){
   setError(err.message||"Bokføringen kunne ikke bekreftes.");
   setPreview(null);
  }finally{setLoading(false);}
 }
 return <div style={{maxWidth:560,marginTop:6}}>
  {!visible&&<button type="button" onClick={review} disabled={loading}
   style={{borderRadius:7,padding:"8px 10px",fontSize:12}}>
   Kontroller gebyr for Tripletex
  </button>}
  {visible&&<div style={{border:"1px solid #c4d1da",borderRadius:10,padding:13,
   margin:"6px 0 10px",fontSize:13}}>
   <strong>Bokfør trukket gebyr – uten bankutbetaling</strong>
   <p>{row.date} · {kr(row.amountOre)}</p>
   {loading&&<p role="status">Kontrollerer Vipps og Tripletex …</p>}
   {error&&<p role="alert" style={{color:"#b04736"}}>{error}</p>}
   {success&&<p role="status">
    Gebyret ble bokført i Tripletex – bilags-ID <b>{success.voucherId}</b>.
    Ingen bankinnbetaling ble opprettet.</p>}
   {preview?.previous&&<p>Dette gebyret har allerede status
    <b> {preview.previous.status}</b> i overføringsloggen. Det kan ikke sendes på nytt.</p>}
   {preview?.ready&&<div style={{display:"grid",gap:10}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
     <span>Gebyr trukket av Vipps</span><b>{kr(preview.plan.amountOre)}</b>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
     <span>Bankutbetaling</span><b>{kr(0)}</b>
    </div>
    <div>Motkonto: <b>{preview.customer.number} {preview.customer.name}</b></div>
    <label style={{display:"grid",gap:4}}>
     Kostnadskonto for Vipps-gebyr
     <select value={feeAccount} onChange={event=>setFeeAccount(event.target.value)}
      disabled={loading}>
      <option value="">Velg gebyrkonto</option>
      {(preview.feeAccounts||[]).map(item=><option value={item.id} key={item.id}>
       {item.number} – {item.name}</option>)}
     </select>
    </label>
    <label style={{display:"flex",gap:8,alignItems:"start"}}>
     <input type="checkbox" checked={checked} disabled={loading}
      onChange={event=>setChecked(event.target.checked)}/>
     Jeg har kontrollert at Vipps-gebyret ikke tidligere er bokført eller fakturert
     og bokført separat i Tripletex.
    </label>
    <button type="button" disabled={loading||!checked||!feeAccount}
     onClick={transfer} style={{background:"#23394c",color:"white",
      borderRadius:8,padding:"12px 14px",fontWeight:700}}>
     Bokfør Vipps-gebyr i Tripletex
    </button>
    <small>Dette er bare faktisk gebyr trukket fra Vipps-saldoen.
     Betalinger på 1 kr kan stå hos Vipps selv om ingen utbetaling er kommet.
     Ved senere bankoppgjør trekkes allerede bokført gebyr fra oppgjørsbilaget.
     Åpne poster på Vipps oppgjørskunde må fortsatt avstemmes i Tripletex.</small>
   </div>}
   <div style={{display:"flex",gap:12,marginTop:12}}>
    {!success&&<button type="button" disabled={loading} onClick={review}>
     Kontroller på nytt</button>}
    <button type="button" onClick={()=>setVisible(false)} disabled={loading}>
     Lukk</button>
   </div>
  </div>}
 </div>;
}
