"use client";
import {useEffect,useState} from "react";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(n||0)/100);
export default function VatRetroCandidatesClient({period,registrationReview,onOpenDate,reload}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const visible=registrationReview?.kind==="first_term";
 useEffect(()=>{
  if(!visible){setData(null);setLoading(false);return;}
  let active=true;setLoading(true);setError("");setData(null);
  const q=new URLSearchParams({year:String(period.year),term:String(period.term)});
  fetch("/api/admin/invoices/vat-retro-candidates?"+q,{cache:"no-store"})
   .then(async r=>{const x=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(x.error||"Historiske kjøp kunne ikke kontrolleres.");
    if(active)setData(x.result);
   }).catch(e=>{if(active)setError(e.message||"Klarte ikke å laste eldre bilag.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false};
 },[visible,period.year,period.term,reload]);
 if(!visible)return null;
 return <section className="card" style={{padding:18,marginBottom:18,border:"2px solid #c4d2dd"}} id="mva-tidligere-kjop">
  <h2>Mulige fradrag fra før registreringsterminen</h2>
  <p style={{fontSize:13}}>Disse leverandørbilagene er registrert i eldre terminer og vises for vurdering av
   <strong> tilbakegående avgiftsoppgjør</strong>. De er <strong>ikke automatisk lagt til</strong> MVA-beregningen for denne terminen.</p>
  {loading&&<p role="status">Henter eldre innkjøpsbilag …</p>}
  {error&&<p role="alert">{error} Ikke bruk listen som komplett grunnlag.</p>}
  {data&&<div>
   <p><strong>{data.count} bilag</strong> fra tidligere terminer. Registrert mulig inngående MVA før vurdering:
    <strong> {money(data.netPotentialOre)}</strong>.</p>
   <p style={{fontSize:13,background:"#fff3de",padding:11,borderRadius:9}}>{data.warning}</p>
   {data.rows.length===0?<p>Ingen registrerte eldre kjøpsbilag innenfor vanlig treårsperiode.</p>:
    <div style={{overflowX:"auto",maxHeight:380}}>
     <table style={{width:"100%",minWidth:530}}>
      <thead><tr><th>Dato og termin</th><th>Leverandør</th><th>Bilagsnummer</th><th style={{textAlign:"right"}}>Mulig MVA</th></tr></thead>
      <tbody>{data.rows.map(r=><tr key={r.id}>
       <td><button type="button" onClick={()=>onOpenDate?.(r.documentDate)}
        title="Vis den historiske terminen">{r.documentDate}</button>
        <small style={{display:"block"}}>{r.period}</small></td>
       <td>{r.supplier}</td><td>{r.documentNumber}<small style={{display:"block"}}>{r.evidenceReference}</small></td>
       <td style={{textAlign:"right"}}>{money(r.vatOre)}</td>
      </tr>)}</tbody>
     </table>
    </div>}
  </div>}
 </section>;
}
