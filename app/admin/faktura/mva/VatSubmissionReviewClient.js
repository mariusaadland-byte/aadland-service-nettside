"use client";
import {useEffect,useState} from "react";
export default function VatSubmissionReviewClient({year,term,revision}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[reload,setReload]=useState(0);
 useEffect(()=>{
  let active=true;setLoading(true);setError("");setData(null);
  const query=new URLSearchParams({year:String(year),term:String(term)});
  fetch("/api/admin/invoices/vat-submission-review?"+query,{cache:"no-store"})
   .then(async r=>{const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||"MVA-kontrollen er utilgjengelig.");
    if(active)setData(d);
   }).catch(e=>{if(active)setError(e.message||"Ukjent kontrollfeil.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[year,term,revision,reload]);
 const review=data?.review;
 return <section className="card" style={{padding:18,marginBottom:18,border:"2px solid #dcc59e"}} id="mva-kontrollliste">
  <h2 style={{margin:"0 0 8px"}}>Kontrolliste før MVA-melding</h2>
  <p style={{fontSize:13}}>Automatisk kontroll for {term}. termin {year}.
   {" "}Denne oversikten er <strong>ikke et klarsignal til å sende inn</strong> og kontrollerer ikke Skatteetaten direkte.</p>
  <button type="button" disabled={loading} onClick={()=>setReload(n=>n+1)}>Oppdater kontroll</button>
  {loading&&<p role="status">Kontrollerer dokumenter, originalfiler og manuell terminstatus …</p>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error} Ikke bruk termintallene som ferdig kontrollgrunnlag.</p>}
  {review&&<div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:11,margin:"14px 0"}}>
    {[
     ["Innkjøpsbilag",review.documentCounts.purchase],
     ["Kjøpsbilag med vedlagt originalfil",review.documentCounts.purchaseAttachments],
     ["Totalt antall kjøpsfiler",review.documentCounts.purchaseFiles],
     ["Importerte kundefakturaer/kreditnotaer",review.documentCounts.externalSales],
     ["Importerte salgsdokumenter med originalfil",review.documentCounts.externalAttachments],
     ["Totalt antall salgsfiler",review.documentCounts.externalFiles]
    ].map(([label,value])=><div key={label} style={{borderBottom:"1px solid #ddd",paddingBottom:8}}>
     <small style={{display:"block"}}>{label}</small><strong>{value}</strong>
    </div>)}
   </div>
   <h3 style={{fontSize:16}}>Dette må du gå gjennom</h3>
   <ul style={{paddingLeft:22,display:"grid",gap:12}}>
    {review.checks.map(check=><li key={check.code}>
     <strong>{check.title}{typeof check.count==="number"?" ("+check.count+")":""}</strong>
     <span style={{display:"block",fontSize:13,marginTop:3}}>{check.detail}</span>
    </li>)}
   </ul>
   <p style={{padding:11,background:"#fff1dc",borderRadius:8,fontSize:13}}>
    <strong>Gjenstår manuell avstemming:</strong> {review.warning}
    {" "}For MVA-meldinger som allerede er levert, må du sammenligne med det som faktisk ble sendt til Skatteetaten.
   </p>
   <p style={{fontSize:13}}><a href="#mobilkvittering">Registrer flere leverandørbilag</a>
    {" · "}<a href="#eldre-kundefakturaer">Importer tidligere kundefakturaer</a>
    {" · "}<a href="#mva-innsending">Kontroller innsendingsstatus</a></p>
  </div>}
 </section>;
}
