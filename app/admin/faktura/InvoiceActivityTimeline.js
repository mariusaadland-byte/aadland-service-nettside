"use client";
import {useEffect,useState} from "react";

const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Math.abs(ore)/100);
const when=value=>{
 if(!value)return "Tidspunkt ikke lagret";
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
  const [y,m,d]=value.split("-");return d+"."+m+"."+y;
 }
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return "Tidspunkt ikke lagret";
 return new Intl.DateTimeFormat("nb-NO",{timeZone:"Europe/Oslo",dateStyle:"short",timeStyle:"short"}).format(date);
};
const labels={invoice:"Faktura",payment:"Betaling",reversal:"Justering",vipps:"Vipps",
 refund:"Tilbakebetaling",credit:"Kreditnota",email:"E-post",reminder:"Purring/varsel"};

export default function InvoiceActivityTimeline({invoice}){
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [expanded,setExpanded]=useState(false),[ascending,setAscending]=useState(false),[retry,setRetry]=useState(0);
 const invoiceId=invoice.id;
 useEffect(()=>{
  let active=true;setLoading(true);setError("");setItems([]);setExpanded(false);
  fetch("/api/admin/invoices/activity?invoiceId="+encodeURIComponent(invoiceId),{cache:"no-store"})
   .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"Kunne ikke hente hendelser.");
    if(active)setItems(d.events||[]);})
   .catch(e=>{if(active)setError(e.message||"Hendelseshistorikken kunne ikke hentes.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false};
 },[invoiceId,invoice.payment_updated_at,invoice.credited_ore,invoice.sent_at,retry]);
 const dated=items.filter(e=>Boolean(e.occurredAt)),undated=items.filter(e=>!e.occurredAt);
 const sorted=[...(ascending?dated.reverse():dated),...undated];
 const shown=expanded?sorted:sorted.slice(0,5);
 return <section id="invoice-activity-timeline" style={{padding:"16px 0",borderBottom:"1px solid #d8c9ae",marginBottom:18}}>
  <div style={{display:"flex",gap:12,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
   <h2 style={{margin:0}}>Hendelseslogg</h2>
   <button type="button" disabled={loading} onClick={()=>setRetry(n=>n+1)}>Oppdater hendelser</button>
  </div>
  <p className="muted" style={{fontSize:13}}>Innbetalinger, Vipps-refusjoner, kreditnotaer og varsler samlet etter dato. Bare visning – ingen betalinger eller e-poster sendes her.</p>
  {loading&&<p role="status">Henter hendelseshistorikk …</p>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error} Historikken vises ikke delvis ved feil. Prøv «Oppdater hendelser».</p>}
  {!loading&&!error&&items.length===0&&<p>Ingen daterte hendelser registrert.</p>}
  {!loading&&!error&&items.length>0&&<>
   <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,fontSize:13,margin:"12px 0"}}>
    <strong>{items.length} {items.length===1?"hendelse":"hendelser"}</strong>
    <button type="button" onClick={()=>setAscending(v=>!v)}>
     {ascending?"Eldste først – bytt til nyeste":"Nyeste først – bytt til eldste"}
    </button>
   </div>
   <ol style={{listStyle:"none",padding:0,margin:0}}>
    {shown.map(event=><li key={event.id} style={{padding:"12px 0 12px 15px",borderLeft:"3px solid #d4bd91",borderBottom:"1px solid #e9e2d7"}}>
     <div style={{fontSize:12,color:"#65594a"}}>{when(event.occurredAt)} · {labels[event.kind]||"Hendelse"}</div>
     <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"baseline",flexWrap:"wrap"}}>
      <strong>{event.title}</strong>
      {event.amountOre!==null&&event.amountOre!==undefined&&<strong>{event.amountOre<0?"−": "+"}{money(event.amountOre)}</strong>}
     </div>
     {event.detail&&<div style={{fontSize:13,marginTop:4,whiteSpace:"pre-wrap"}}>{event.detail}</div>}
     {event.link&&<a href={event.link} target="_blank" rel="noreferrer" style={{fontSize:13,display:"inline-block",marginTop:6}}>Åpne dokument (PDF)</a>}
    </li>)}
   </ol>
   {items.length>5&&<button type="button" style={{marginTop:12}} onClick={()=>setExpanded(v=>!v)}>
    {expanded?"Vis færre hendelser":"Vis alle "+items.length+" hendelser"}
   </button>}
   <p style={{fontSize:12,color:"#756957"}}>Pluss er registrerte innbetalinger. Minus viser refusjoner, krediteringer eller reverseringer. Linjene skal ikke summeres: original betaling og senere regnskapsjustering kan vises hver for seg. Oppgjørsoversikten viser riktig saldo.</p>
  </>}
 </section>;
}
