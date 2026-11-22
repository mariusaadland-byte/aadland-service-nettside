"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {osloDateTimeLocal,osloLocalDateTimeToIso} from "../../../../../lib/osloTime";

const kr=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format((Number(ore)||0)/100);
const date=v=>v?new Intl.DateTimeFormat("nb-NO",{dateStyle:"long"}).format(new Date(v+"T12:00:00")):"";
const dateTime=v=>v?new Intl.DateTimeFormat("nb-NO",{dateStyle:"long",timeStyle:"short",timeZone:"Europe/Oslo"}).format(new Date(v)):"";

export default function PlanJobClient({jobId}){
 const [job,setJob]=useState(null);
 const [startAt,setStartAt]=useState("");
 const [agreement,setAgreement]=useState("");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [sending,setSending]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [canReview,setCanReview]=useState(false);
 const [reviewResult,setReviewResult]=useState("");
 const [reviewNote,setReviewNote]=useState("");
 const [reviewEmailId,setReviewEmailId]=useState("");
 const [reviewConfirmation,setReviewConfirmation]=useState("");
 const [reviewing,setReviewing]=useState(false);
 const dirty=Boolean(job)&&(startAt!==osloDateTimeLocal(job.startAt)||
  agreement.trim()!==(job.agreement||"").trim());
 const delivery=job?.delivery||{};
 const blockedByUnresolved=Boolean(delivery.unresolved);
 const confirmedCurrent=Boolean(job?.confirmationSentAt)&&!dirty;
 const attemptedCurrent=delivery.state!=="not_sent"&&delivery.state!=="legacy_sent"&&
  Boolean(delivery.state)&&!dirty;
 const cannotSend=blockedByUnresolved||confirmedCurrent||attemptedCurrent;

 async function load(){
  setLoading(true);setError("");
  try{
   const r=await fetch("/api/admin/jobs/plan?id="+encodeURIComponent(jobId),{cache:"no-store"});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.setupRequired?"Databaseoppdatering mangler for planlegging av oppdrag.":(d.error||"Oppdraget kunne ikke lastes."));
   setJob(d.job);setCanReview(Boolean(d.canReview));setStartAt(osloDateTimeLocal(d.job.startAt));setAgreement(d.job.agreement||"");
  }catch(err){setError(err.message||"Oppdraget kunne ikke lastes. Kontroller nettet og prøv igjen.");}
  finally{setLoading(false);}
 }

 useEffect(()=>{load()},[jobId]);

 function payload(){
  return {
   id:jobId,
   startAt:startAt?osloLocalDateTimeToIso(startAt):"",
   agreement,
   expectedRevision:job?.planRevision||null
  };
 }

 async function save(){
  if(saving||sending)return false;
  setSaving(true);setError("");setMessage("");
  try{
   const body=payload();
   if(startAt&&!body.startAt)throw new Error("Velg gyldig oppstartstid i Oslo-tid.");
   const r=await fetch("/api/admin/jobs/plan",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error||"Planen kunne ikke lagres.");
   setJob(current=>({...current,...d.job}));
   setMessage(d.job.confirmationSentAt?"Planen er lagret.":"Planen er lagret. Send bekreftelse slik at kunden får gjeldende avtale.");
   return true;
  }catch(err){setError(err.message||"Planen kunne ikke lagres. Kontroller nettet og prøv igjen.");return false;}
  finally{setSaving(false);}
 }

 async function review(){
  if(reviewing||saving||sending||!canReview||!delivery.unresolved)return;
  const phrase=reviewResult==="sent"?"BEKREFTET I RESEND":"IKKE SENDT";
  if(!["sent","unsent"].includes(reviewResult)||reviewConfirmation!==phrase||
   reviewNote.trim().length<12||
   reviewResult==="sent"&&reviewEmailId.trim().length<8){
   setError("Kontroller Resend og fyll ut resultat, bekreftelsestekst og merknad.");return;
  }
  setReviewing(true);setError("");setMessage("");
  try{
   const response=await fetch("/api/admin/jobs/plan",{method:"PATCH",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"review",id:jobId,attemptId:delivery.unresolved.id,
     outcome:reviewResult,confirmation:reviewConfirmation,
     note:reviewNote,providerId:reviewEmailId})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||"Kontrollen kunne ikke lagres.");
   setReviewResult("");setReviewNote("");setReviewEmailId("");setReviewConfirmation("");
   await load();
   setMessage("Resend-kontrollen er lagret. Ingen ny e-post er sendt.");
  }catch(err){setError(err.message||"Kunne ikke fullføre Resend-kontrollen.");}
  finally{setReviewing(false);}
 }
 async function send(){
  if(saving||sending||cannotSend)return;
  if(!startAt){setError("Velg avtalt oppstart først.");return}
  if(!agreement.trim()){setError("Skriv hva som er avtalt videre med kunden.");return}
  const email=job?.customer?.email||"kunden";
  if(!window.confirm("Lagre planen og sende bekreftelse til "+email+"?"))return;
  setSending(true);setError("");setMessage("");
  try{
   const body=payload();
   if(startAt&&!body.startAt)throw new Error("Velg gyldig oppstartstid i Oslo-tid.");
   const r=await fetch("/api/admin/jobs/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   const d=await r.json().catch(()=>({}));
   if(!r.ok){await load();throw new Error(d.error||"Bekreftelsen kunne ikke sendes.");}
   setJob(current=>({...current,startAt:body.startAt,agreement:body.agreement,
    planRevision:d.planRevision||current.planRevision,
    confirmationSentAt:d.sentAt||new Date().toISOString(),
    delivery:{state:"sent",sentAt:d.sentAt}}));
   setMessage("Bekreftelse er sendt til "+(d.sentTo||email)+".");
  }catch(err){setError(err.message||"Bekreftelsen kunne ikke bekreftes sendt. Last inn planen før du prøver igjen.");}
  finally{setSending(false);}
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

    {blockedByUnresolved&&<p className="notice"><strong>Sendestatus må avklares.</strong>
     Et tidligere forsøk har uavklart resultat. Kontroller Resend før noen ny kundebekreftelse sendes.</p>}
    {confirmedCurrent&&<p className="success">Gjeldende plan er allerede bekreftet på e-post.
     Endre dato eller avtaletekst før en ny bekreftelse kan sendes.</p>}
    {attemptedCurrent&&!confirmedCurrent&&!blockedByUnresolved&&
     <p className="notice">Denne planversjonen har allerede hatt et sendeforsøk.
      Den kan ikke sendes automatisk på nytt.</p>}
    <div className="jobPlanningActions">
     <button className="btn alt" type="button" disabled={saving||sending||reviewing} onClick={save}>{saving?"Lagrer …":"Lagre plan"}</button>
     <button className="btn jobPlanningSend" type="button" disabled={saving||sending||reviewing||cannotSend} onClick={send}>{sending?"Sender …":"Lagre og send bekreftelse"}</button>
    </div>
    {delivery.unresolved&&canReview&&<section style={{padding:14,marginTop:20,
     border:"1px solid #d5a66f",borderRadius:10}}>
     <h3>Avklar uvisst sendeforsøk</h3>
     <p>Dette sender ingen ny e-post. Finn den faktiske meldingsstatusen i Resend.
      Vent minst fem minutter etter forsøket før du registrerer utfallet.</p>
     <label>Resultat fra Resend
      <select value={reviewResult} onChange={e=>{setReviewResult(e.target.value);setReviewConfirmation("");}}>
       <option value="">Velg kontrollert resultat</option>
       <option value="sent">Bekreftet akseptert i Resend</option>
       <option value="unsent">Bekreftet IKKE sendt</option>
      </select>
     </label>
     {reviewResult==="sent"&&<label>Resend meldings-ID
      <input value={reviewEmailId} onChange={e=>setReviewEmailId(e.target.value)} placeholder="Faktisk ID fra Resend"/>
     </label>}
     <label>Hva kontrollerte du? (minst 12 tegn)
      <textarea rows={3} value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/>
     </label>
     <label>Bekreft kontrollen
      <input value={reviewConfirmation} onChange={e=>setReviewConfirmation(e.target.value)}
       placeholder={reviewResult==="sent"?"BEKREFTET I RESEND":"IKKE SENDT"}/>
     </label>
     <button type="button" className="btn alt" disabled={reviewing||saving||sending||!reviewResult}
      onClick={review}>{reviewing?"Kontrollerer …":"Lagre kontroll uten ny sending"}</button>
    </section>}
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
     <span><small>Sendestatus</small><b>{delivery.unresolved?"Må kontrolleres":
      delivery.state==="sent"||delivery.state==="reviewed_sent"?"Akseptert av Resend":
      delivery.state==="cancelled"?"Avbrutt – plan endret":
      delivery.state==="reviewed_unsent"?"Bekreftet ikke sendt":
      job.confirmationSentAt?"Sendt tidligere":"Ikke forsøkt"}</b></span>
     <span><small>Påminnelse sendt</small><b>{job.reminderSentAt?dateTime(job.reminderSentAt):"Ikke sendt"}</b></span>
    </div>
    <p className="muted">Når bekreftelsen sendes, får kunden avtalt oppstart og teksten du har skrevet under «Hva er avtalt videre».</p>
   </aside>
  </div>
 </main>;
}
