"use client";

import {useEffect,useState} from "react";
import Link from "next/link";

const kr=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format((Number(ore)||0)/100);
const date=v=>v?new Intl.DateTimeFormat("nb-NO",{dateStyle:"long"}).format(new Date(v+"T12:00:00")):"";
const dateTime=v=>v?new Intl.DateTimeFormat("nb-NO",{dateStyle:"long",timeStyle:"short"}).format(new Date(v)):"";

function inputDateTime(value){
 if(!value)return "";
 const d=new Date(value);
 if(Number.isNaN(d.getTime()))return "";
 const pad=n=>String(n).padStart(2,"0");
 return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"T"+pad(d.getHours())+":"+pad(d.getMinutes());
}

export default function PlanJobClient({jobId}){
 const [job,setJob]=useState(null);
 const [startAt,setStartAt]=useState("");
 const [agreement,setAgreement]=useState("");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [sending,setSending]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");

 async function load(){
  setLoading(true);setError("");
  const r=await fetch("/api/admin/jobs/plan?id="+encodeURIComponent(jobId));
  const d=await r.json().catch(()=>({}));
  setLoading(false);
  if(!r.ok){
   setError(d.setupRequired?"Databaseoppdatering mangler for planlegging av oppdrag.":(d.error||"Oppdraget kunne ikke lastes."));
   return;
  }
  setJob(d.job);
  setStartAt(inputDateTime(d.job.startAt));
  setAgreement(d.job.agreement||"");
 }

 useEffect(()=>{load()},[jobId]);

 function payload(){
  return {
   id:jobId,
   startAt:startAt?new Date(startAt).toISOString():"",
   agreement
  };
 }

 async function save(){
  setSaving(true);setError("");setMessage("");
  let body;
  try{body=payload()}catch{setSaving(false);setError("Velg gyldig oppstartstid.");return false}
  const r=await fetch("/api/admin/jobs/plan",{
   method:"PATCH",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify(body)
  });
  const d=await r.json().catch(()=>({}));
  setSaving(false);
  if(!r.ok){setError(d.error||"Planen kunne ikke lagres.");return false}
  setJob(current=>({...current,...d.job}));
  setMessage("Planen er lagret.");
  return true;
 }

 async function send(){
  if(!startAt){setError("Velg avtalt oppstart først.");return}
  if(!agreement.trim()){setError("Skriv hva som er avtalt videre med kunden.");return}
  const email=job?.customer?.email||"kunden";
  if(!window.confirm("Lagre planen og sende bekreftelse til "+email+"?"))return;
  setSending(true);setError("");setMessage("");
  let body;
  try{body=payload()}catch{setSending(false);setError("Velg gyldig oppstartstid.");return}
  const r=await fetch("/api/admin/jobs/plan",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify(body)
  });
  const d=await r.json().catch(()=>({}));
  setSending(false);
  if(!r.ok){setError(d.error||"Bekreftelsen kunne ikke sendes.");return}
  setJob(current=>({...current,startAt:body.startAt,agreement:body.agreement,confirmationSentAt:d.sentAt||new Date().toISOString()}));
  setMessage("Bekreftelse er sendt til "+(d.sentTo||email)+".");
 }

 if(loading)return <main className="jobPlanningPage"><div className="card">Laster oppdrag …</div></main>;
 if(!job)return <main className="jobPlanningPage"><div className="card"><h1>Oppdraget kunne ikke åpnes</h1><p>{error}</p><Link className="btn alt" href="/admin">Tilbake til backoffice</Link></div></main>;

 return <main className="jobPlanningPage">
  <div className="jobPlanningHeader">
   <div>
    <Link className="btn alt" href="/admin">← Backoffice</Link>
    <div className="kicker">OPPDRAGSPLANLEGGING</div>
    <h1>{job.quote?.title||"Planlegg oppdrag"}</h1>
    <p>{job.orderNumber}{job.quote?.quoteNumber?" · "+job.quote.quoteNumber:""}</p>
   </div>
   {job.quote?.id&&<Link className="btn alt" href={"/admin/tilbud/"+job.quote.id}>Åpne tilbud</Link>}
  </div>

  {error&&<p className="notice">{error}</p>}
  {message&&<p className="success">{message}</p>}

  <div className="jobPlanningGrid">
   <section className="card jobPlanningForm">
    <div className="kicker">AVTALE MED KUNDEN</div>
    <h2>Oppstart og videre plan</h2>
    <p className="muted">Dette er den faktiske avtalen etter at kunden har godkjent tilbudet.</p>

    {job.quote?.earliestStartDate&&<div className="jobPlanningEarliest">
     <small>Tidligst oppstart i tilbudet</small>
     <b>{date(job.quote.earliestStartDate)}</b>
    </div>}

    <div className="field">
     <label>Avtalt oppstart *</label>
     <input type="datetime-local" value={startAt} onChange={e=>setStartAt(e.target.value)}/>
     <small className="muted">Velg dato og klokkeslett dere faktisk har avtalt.</small>
    </div>

    <div className="field">
     <label>Hva er avtalt videre med kunden? *</label>
     <textarea rows="8" value={agreement} onChange={e=>setAgreement(e.target.value)} placeholder="F.eks. Vi starter med riving mandag. Kunde sørger for at rommet er tømt. Materiallevering avtales fortløpende."/>
    </div>

    <div className="jobPlanningActions">
     <button className="btn alt" type="button" disabled={saving||sending} onClick={save}>{saving?"Lagrer …":"Lagre plan"}</button>
     <button className="btn jobPlanningSend" type="button" disabled={saving||sending} onClick={send}>{sending?"Sender …":"Lagre og send bekreftelse"}</button>
    </div>
   </section>

   <aside className="card jobPlanningSummary">
    <div className="kicker">KUNDE</div>
    <h3>{job.customer?.name||"Kunde"}</h3>
    {job.customer?.email&&<a href={"mailto:"+job.customer.email}>{job.customer.email}</a>}
    {job.customer?.phone&&<a href={"tel:"+job.customer.phone}>{job.customer.phone}</a>}
    {job.customer?.address&&<p>{job.customer.address}</p>}
    <div className="jobPlanningFacts">
     <span><small>Avtalt total</small><b>{kr(job.totalOre)}</b></span>
     <span><small>Status</small><b>{job.status}</b></span>
     <span><small>Sist lagret</small><b>{job.planningUpdatedAt?dateTime(job.planningUpdatedAt):"Ikke planlagt"}</b></span>
     <span><small>Bekreftelse sendt</small><b>{job.confirmationSentAt?dateTime(job.confirmationSentAt):"Ikke sendt"}</b></span>
    </div>
    <p className="muted">Når bekreftelsen sendes, får kunden avtalt oppstart og teksten du har skrevet under «Hva er avtalt videre».</p>
   </aside>
  </div>
 </main>;
}
