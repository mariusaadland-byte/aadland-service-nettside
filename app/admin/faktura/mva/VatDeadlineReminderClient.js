"use client";
import {useEffect,useState} from "react";

const formatDate=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)
 ?v.slice(8,10)+"."+v.slice(5,7)+"."+v.slice(0,4):"–";
const before=(day,lead)=>{
 const at=Date.parse(day+"T00:00:00Z");
 return Number.isFinite(at)?new Date(at-lead*86400000).toISOString().slice(0,10):"";
};
const labels={
 claimed:"Sendeprosess startet – kontroller ved usikkerhet",
 needs_review:"Uklart Resend-svar – ingen automatisk ny sending",
 provider_accepted:"Bekreftet hos Resend – lokal registrering må fullføres",
 sent:"Varsel bekreftet sendt",
 skipped:"Stoppet – termin registrert som levert"
};
export default function VatDeadlineReminderClient(){
 const [data,setData]=useState(null),[loading,setLoading]=useState(false),
  [error,setError]=useState(""),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let alive=true;
  setLoading(true);setError("");
  fetch("/api/admin/invoices/vat-deadline-reminders",{cache:"no-store"})
   .then(async response=>{
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(body.error||"MVA-fristvarsler er utilgjengelige.");
    if(alive)setData(body);
   }).catch(err=>{if(alive){setData(null);setError(err.message||"Kan ikke hente friststatus.");}})
   .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[revision]);
 const upcoming=data?.upcoming||[];
 const attempts=data?.attempts||[];
 const relevant=upcoming.find(row=>row.status!=="filed")||upcoming[0];
 const futureDates=relevant?[28,14].map(days=>({
  days,date:before(relevant.deadline,days)
 })).filter(x=>x.date>=data.today):[];
 return <details style={{border:"1px solid #d3d7d3",borderRadius:10,margin:"12px 0 18px",padding:12}}>
  <summary style={{cursor:"pointer",fontWeight:700}}>
   MVA-frister og automatiske påminnelser
   {relevant&&<span style={{display:"block",fontSize:13,fontWeight:400}}>
    Neste frist: {formatDate(relevant.deadline)} – {relevant.term}. termin {relevant.year}
   </span>}
  </summary>
  <div style={{paddingTop:10}}>
   <p style={{fontSize:13}}>Systemet sender interne e-poster til post@aadland-service.no
    28 og 14 dager før ordinær MVA-frist når terminstatus ikke er registrert som levert.
    Påminnelsen leverer ikke MVA-melding og bekrefter ikke innsendingsstatus hos Skatteetaten.</p>
   {loading&&<p role="status">Henter varslingshistorikk …</p>}
   {error&&<p role="alert" style={{color:"#9a281c"}}>{error} Ikke anta at varslene er sendt.</p>}
   {data&&!data.active&&<p>MVA-registrering må bekreftes før varsler aktiveres.</p>}
   {relevant&&<div style={{borderTop:"1px solid #ddd",paddingTop:10}}>
    <strong>{relevant.term}. termin {relevant.year} · frist {formatDate(relevant.deadline)}</strong>
    <p style={{fontSize:13,margin:"5px 0"}}>
     Status i Aadland Service: {relevant.status==="filed"?"Registrert som levert":
      relevant.status==="not_filed"?"Manuelt markert ikke levert":
       relevant.status==="preparing"?"Under arbeid":"Ikke kontrollert"}.
     {relevant.status==="filed"?" Ingen nye varsel sendes for denne terminen.":
       " Kontroller faktisk innsendingsstatus hos Skatteetaten eller Tripletex."}
    </p>
    {futureDates.length>0&&<p style={{fontSize:13}}>
     Kommende påminnelser: {futureDates.map(x=>formatDate(x.date)+" ("+x.days+" dager før)").join(" · ")}
    </p>}
   </div>}
   <h4 style={{margin:"14px 0 7px",fontSize:14}}>Siste varslingsforsøk</h4>
   {attempts.length===0?<p style={{fontSize:13}}>Ingen automatiske MVA-påminnelser er registrert ennå.</p>:
    <div style={{display:"grid",gap:8}}>
     {attempts.slice(0,8).map(a=><div key={a.year+"-"+a.term+"-"+a.lead_days}
      style={{borderBottom:"1px solid #ddd",paddingBottom:7,fontSize:13}}>
      <strong>{a.term}. termin {a.year} – {a.lead_days} dager før frist {formatDate(a.due_date)}</strong>
      <span style={{display:"block",overflowWrap:"anywhere"}}>{labels[a.status]||"Ukjent status"}
       {a.sent_at?" · "+new Date(a.sent_at).toLocaleString("nb-NO"):""}</span>
     </div>)}
    </div>}
   <button type="button" disabled={loading} onClick={()=>setRevision(v=>v+1)}
    style={{marginTop:12,border:"1px solid #a6b8ad",borderRadius:8,
     padding:"9px 14px",background:"#fff",color:"#20372b",cursor:"pointer"}}>
    Oppdater friststatus
   </button>
  </div>
 </details>;
}
