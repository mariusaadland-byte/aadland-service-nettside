"use client";

import {useState} from "react";

const amount=ore=>new Intl.NumberFormat("nb-NO",{
 style:"currency",currency:"NOK"
}).format(Number(ore||0)/100);

export default function VippsTripletexTransferPanel({row,unit}){
 const [loading,setLoading]=useState(false);
 const [preview,setPreview]=useState(null);
 const [bank,setBank]=useState(""),[fee,setFee]=useState("");
 const [received,setReceived]=useState(false),[notImported,setNotImported]=useState(false);
 const [error,setError]=useState(""),[success,setSuccess]=useState(null);
 const [show,setShow]=useState(false);
 if(unit!=="service"||!row?.pspReference)return null;
 async function review(){
  if(loading)return;
  setLoading(true);setError("");setPreview(null);setSuccess(null);
  setReceived(false);setNotImported(false);setBank("");setFee("");
  setShow(true);
  try{
   const params=new URLSearchParams({unit:"service",date:row.date,
    payoutId:row.pspReference});
   const r=await fetch("/api/admin/tripletex/vipps-transfer?"+params,{
    cache:"no-store"});
   const b=await r.json().catch(()=>({}));
   if(!r.ok||!b.ok)throw Error(b.error||"Kontrollen av Tripletex-bilaget feilet.");
   setPreview(b);
   if((b.bankAccounts||[]).length===1)setBank(String(b.bankAccounts[0].id));
   if((b.feeAccounts||[]).length===1)setFee(String(b.feeAccounts[0].id));
  }catch(e){setError(e.message||"Kunne ikke kontrollere utbetalingen.");}
  finally{setLoading(false);}
 }
 async function transfer(){
  if(loading||!preview?.ready||!bank||!fee||!received||!notImported)return;
  if(!window.confirm("Bekrefter du at denne Vipps-utbetalingen er kommet inn på bankkontoen, "+
   "og at samme oppgjør IKKE tidligere er bokført/importert i Tripletex? "+
   "Det blir opprettet ett ekte regnskapsbilag."))return;
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/admin/tripletex/vipps-transfer",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"transfer",unit:"service",date:row.date,
     payoutId:row.pspReference,bankAccountId:Number(bank),feeAccountId:Number(fee),
     expectedDigest:preview.digest,confirmed:true,
     bankReceived:received,notImportedPreviously:notImported})
   });
   const b=await r.json().catch(()=>({}));
   if(!r.ok||!b.ok)throw Error(b.error||
    "Overføringen er uavklart. Kontroller Tripletex før nytt forsøk.");
   setSuccess(b);setPreview(null);
  }catch(e){setError(e.message||
   "Overføringsforsøket kunne ikke bekreftes. Kontroller Tripletex.");
   setPreview(null);
  }finally{setLoading(false);}
 }
 return <div style={{marginTop:6,maxWidth:620}}>
  {!show&&<button type="button" disabled={loading}
   onClick={review} style={{fontSize:12,padding:"8px 10px",borderRadius:7}}>
   Kontroller for Tripletex
  </button>}
  {show&&<div style={{border:"1px solid #c4d1da",borderRadius:10,
   padding:14,margin:"8px 0 12px",background:"transparent"}}>
   <strong>Overfør denne Vipps-utbetalingen</strong>
   <p style={{fontSize:13,margin:"5px 0"}}>Dato {row.date} · {amount(row.amountOre)}</p>
   {loading&&<p role="status" style={{fontSize:13}}>
    {preview?"Bokfører i Tripletex …":"Kontrollerer Vipps, fakturaer og Tripletex …"}
   </p>}
   {error&&<p role="alert" style={{fontSize:13,color:"#b04736"}}>{error}</p>}
   {success&&<p role="status" style={{fontSize:13}}>
    Oppgjøret er bokført i Tripletex med bilags-ID <strong>{success.voucherId}</strong>.
    Kontroller og lukk åpne poster på Vipps oppgjørskunde (10009).
   </p>}
   {preview?.previous&&<p style={{fontSize:13}}>
    Dette oppgjøret har allerede overføringsstatus <b>{preview.previous.status}</b>.
    Det sendes ikke på nytt.
   </p>}
   {preview?.ready&&<div style={{display:"grid",gap:9,fontSize:13}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:5}}>
     <span>Fakturaer betalt via Vipps</span><b>{amount(preview.plan.grossOre)}</b>
     <span>Vipps-gebyr totalt trukket</span><b>{amount(preview.plan.feeOre)}</b>
     <span>Gebyr bokført tidligere uten utbetaling</span>
     <b>−{amount(preview.plan.previouslyBookedFeeOre||0)}</b>
     <span>Gebyr som føres i dette bilaget</span>
     <b>{amount(preview.plan.feeOre-(preview.plan.previouslyBookedFeeOre||0))}</b>
     <span>Netto til bankkonto</span><b>{amount(preview.plan.payoutOre)}</b>
    </div>
    <p style={{margin:0}}>
     {preview.plan.paymentCount} fakturabetalinger bekreftet i Tripletex.
     Kundereskontro: {preview.customer.number} {preview.customer.name}.
    </p>
    <label style={{display:"grid",gap:4}}>
     Bankkonto (kontoen Vipps har utbetalt til)
     <select value={bank} onChange={e=>setBank(e.target.value)} disabled={loading}>
      <option value="">Velg bankkonto fra Tripletex</option>
      {(preview.bankAccounts||[]).map(a=><option key={a.id} value={a.id}>
       {a.number} – {a.name}
      </option>)}
     </select>
    </label>
    <label style={{display:"grid",gap:4}}>
     Konto for Vipps-gebyrer
     <select value={fee} onChange={e=>setFee(e.target.value)} disabled={loading}>
      <option value="">Velg gebyrkonto</option>
      {(preview.feeAccounts||[]).map(a=><option key={a.id} value={a.id}>
       {a.number} – {a.name}
      </option>)}
     </select>
    </label>
    <label style={{display:"flex",gap:8,alignItems:"start"}}>
     <input type="checkbox" checked={received} onChange={e=>setReceived(e.target.checked)}
      disabled={loading}/>
     Jeg har kontrollert at netto utbetaling er mottatt på valgt bankkonto.
    </label>
    <label style={{display:"flex",gap:8,alignItems:"start"}}>
     <input type="checkbox" checked={notImported}
      onChange={e=>setNotImported(e.target.checked)} disabled={loading}/>
     Jeg har kontrollert at oppgjøret ikke allerede er importert eller bokført i Tripletex.
    </label>
    <button type="button" disabled={loading||!bank||!fee||!received||!notImported}
     onClick={transfer} style={{padding:"12px 14px",borderRadius:8,
      background:"#23394c",color:"white",fontWeight:700}}>
     Overfør oppgjørsbilaget til Tripletex
    </button>
    <small>Dette registrerer ikke nye salg. Det posterer bankinnbetalingen, Vipps-gebyret
     og en motpost på Vipps oppgjørskunde (10009). Åpne poster må fremdeles lukkes
     i kundereskontroen. Overføring med ukjent utfall kan ikke prøves igjen automatisk.</small>
   </div>}
   <div style={{marginTop:12,display:"flex",gap:12,flexWrap:"wrap"}}>
    {!success&&<button type="button" onClick={review} disabled={loading}>
     Kontroller på nytt
    </button>}
    <button type="button" onClick={()=>setShow(false)} disabled={loading}>
     Lukk
    </button>
   </div>
  </div>}
 </div>;
}
