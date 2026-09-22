"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";

const statusLabels={
 draft:"Kladd",
 sent:"Sendt",
 accepted:"Godkjent",
 declined:"Avslått",
 expired:"Utløpt",
 cancelled:"Avbrutt"
};
const nok=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format((Number(ore)||0)/100);

export default function QuotesClient(){
 const [quotes,setQuotes]=useState([]);
 const [loading,setLoading]=useState(true);
 const [setupRequired,setSetupRequired]=useState(false);
 const [error,setError]=useState("");
 const [filter,setFilter]=useState("all");
 const [showArchived,setShowArchived]=useState(false);

 async function load(){
  setLoading(true);setError("");
  const response=await fetch("/api/admin/quotes"+(showArchived?"?archived=1":""));
  const data=await response.json().catch(()=>({}));
  setLoading(false);
  if(!response.ok){
   setError(data.error||"Tilbudene kunne ikke hentes.");
   setSetupRequired(data.setupRequired===true);
   return;
  }
  setQuotes(data.quotes||[]);
  setSetupRequired(data.setupRequired===true);
 }

 useEffect(()=>{load()},[showArchived]);

 const visible=useMemo(()=>filter==="all"?quotes:quotes.filter(quote=>quote.status===filter),[quotes,filter]);
 const stats=useMemo(()=>({
  draft:quotes.filter(q=>q.status==="draft").length,
  sent:quotes.filter(q=>q.status==="sent").length,
  accepted:quotes.filter(q=>q.status==="accepted").length,
  acceptedValue:quotes.filter(q=>q.status==="accepted").reduce((sum,q)=>sum+(Number(q.totalIncVatOre)||0),0)
 }),[quotes]);

 async function duplicate(quote){
  setError("");
  const valid=new Date();
  valid.setDate(valid.getDate()+30);
  const response=await fetch("/api/admin/quotes",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({
    title:quote.title,
    status:"draft",
    customer:quote.customer,
    lineItems:quote.lineItems,
    paymentPlan:quote.paymentPlan,
    introText:quote.introText,
    notes:quote.notes,
    terms:quote.terms,
    validUntil:valid.toISOString().slice(0,10)
   })
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){setError(data.error||"Tilbudet kunne ikke kopieres.");return;}
  window.location.href="/admin/tilbud/"+data.quote.id;
 }

 async function archive(id,restore=false){
  if(!restore&&!window.confirm("Arkivere dette tilbudet?"))return;
  const response=await fetch("/api/admin/quotes",{
   method:"PATCH",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({id,action:restore?"restore":"archive"})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){setError(data.error||(restore?"Tilbudet kunne ikke gjenopprettes.":"Tilbudet kunne ikke arkiveres."));return;}
  await load();
 }

 return <main className="admin quoteAdminPage">
  <section className="adminmain quoteAdminMain">
   <div className="kicker">Aadland Service / Back office</div>
   <div className="quoteAdminHeader">
    <div>
     <Link className="btn alt" href="/admin">← Tilbake til backoffice</Link>
     <h1>Tilbud</h1>
     <p className="muted">Lag, pris, følg opp og skriv ut profesjonelle tilbud.</p>
    </div>
    <div className="quoteAdminHeaderActions">
     <button type="button" className="btn alt" onClick={()=>{setFilter("all");setShowArchived(value=>!value)}}>{showArchived?"Aktive tilbud":"Arkiv"}</button>
     <Link className="btn" href="/admin/tilbud/ny">Nytt tilbud</Link>
    </div>
   </div>

   {error&&<p className="notice">{error}</p>}

   {setupRequired&&<div className="adminProjectMigrationWarning">
    <b>Databaseoppdatering mangler</b>
    <span>Tilbudssystemet er ferdig programmert, men tilbudstabellen må opprettes i Supabase før du kan bruke det.</span>
    <code>supabase/quotes.sql</code>
    <small>Kjør innholdet i denne filen én gang i Supabase SQL Editor.</small>
   </div>}

   {!setupRequired&&<>
    <div className="quoteStats">
     <div className="stat"><span className="muted">Kladd</span><br/><b>{stats.draft}</b></div>
     <div className="stat"><span className="muted">Sendt</span><br/><b>{stats.sent}</b></div>
     <div className="stat"><span className="muted">Godkjent</span><br/><b>{stats.accepted}</b></div>
     <div className="stat"><span className="muted">Godkjent verdi</span><br/><b>{nok(stats.acceptedValue)}</b></div>
    </div>

    {!showArchived&&<div className="quoteFilters">
     <button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>Alle</button>
     {Object.entries(statusLabels).map(([value,label])=><button key={value} className={filter===value?"active":""} onClick={()=>setFilter(value)}>{label}</button>)}
    </div>}

    {showArchived&&<div className="quoteArchiveHeading"><div><div className="kicker">ARKIV</div><h2>Arkiverte tilbud</h2></div><span>{quotes.length} tilbud</span></div>}

    {loading?<div className="card">Laster tilbud …</div>:visible.length?(
     <div className="quoteList">
      {visible.map(quote=><article className="card quoteListCard" key={quote.id}>
       <div className="quoteListTop">
        <div>
         <div className="kicker">{quote.quoteNumber}</div>
         <h3>{quote.title}</h3>
         <p>{quote.customer?.name||"Ukjent kunde"}{quote.customer?.phone?" · "+quote.customer.phone:""}</p>
        </div>
        <span className={"quoteStatus quoteStatus-"+quote.status}>{statusLabels[quote.status]||quote.status}</span>
       </div>
       <div className="quoteListMeta">
        <span><small>Total inkl. MVA</small><b>{nok(quote.totalIncVatOre)}</b></span>
        <span><small>Opprettet</small><b>{quote.createdAt?new Date(quote.createdAt).toLocaleDateString("nb-NO"):"—"}</b></span>
        <span><small>Gyldig til</small><b>{quote.validUntil?new Date(quote.validUntil+"T12:00:00").toLocaleDateString("nb-NO"):"Ikke satt"}</b></span>
       </div>
       {quote.convertedOrderId&&<div className="quoteConvertedListBadge">✓ Oppdrag opprettet</div>}
       <div className="quoteListActions">
        <Link className="btn" href={"/admin/tilbud/"+quote.id}>Åpne</Link>
        <Link className="btn alt" href={"/admin/tilbud/"+quote.id+"/preview"}>Forhåndsvis</Link>
        <button type="button" className="btn alt" onClick={()=>duplicate(quote)}>Kopier</button>
        {showArchived?<button type="button" className="btn alt" onClick={()=>archive(quote.id,true)}>Gjenopprett</button>:<button type="button" className="btn alt" onClick={()=>archive(quote.id)}>Arkiver</button>}
       </div>
      </article>)}
     </div>
    ):<div className="card"><h3>Ingen tilbud her ennå</h3><p className="muted">Trykk «Nytt tilbud» for å lage det første.</p></div>}
   </>}
  </section>
 </main>;
}
