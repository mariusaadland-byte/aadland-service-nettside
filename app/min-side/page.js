"use client";

import {useEffect,useState} from "react";
import Link from "next/link";

const orderStatus={new:"Mottatt",confirmed:"Bekreftet",processing:"Under behandling",in_progress:"Under arbeid",ready:"Klar",completed:"Fullført",cancelled:"Kansellert"};
const rentalStatus={new:"Mottatt",confirmed:"Bekreftet",active:"Pågående",returned:"Returnert",completed:"Fullført",cancelled:"Kansellert"};
const quoteStatus={sent:"Sendt",accepted:"Godkjent",declined:"Avslått",expired:"Utløpt",cancelled:"Avbrutt"};
const paymentStatus={unpaid:"Ikke betalt",pending:"Avventer betaling",authorized:"Reservert",paid:"Betalt",refunded:"Refundert"};

const date=v=>v?new Intl.DateTimeFormat("nb-NO").format(new Date(v+"T12:00:00")):"";
const dateTime=v=>v?new Intl.DateTimeFormat("nb-NO",{dateStyle:"medium"}).format(new Date(v)):"";
const dateTimeFull=v=>v?new Intl.DateTimeFormat("nb-NO",{dateStyle:"long",timeStyle:"short"}).format(new Date(v)):"";
const kr=o=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format((Number(o)||0)/100);
const effectiveQuoteStatus=q=>{
 if(q.status==="sent"&&q.validUntil&&q.validUntil<new Date().toISOString().slice(0,10))return "expired";
 return q.status;
};

export default function MinSide(){
 const [mode,setMode]=useState("login");
 const [form,setForm]=useState({name:"",email:"",phone:"",address:"",password:""});
 const [data,setData]=useState(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [info,setInfo]=useState("");

 async function load(){
  try{
   const r=await fetch("/api/customer/me");
   const d=await r.json();
   if(r.ok)setData(d);else setData(null);
  }finally{setLoading(false)}
 }

 useEffect(()=>{load()},[]);

 async function submit(e){
  e.preventDefault();setBusy(true);setError("");setInfo("");
  try{
   const r=await fetch("/api/customer/"+(mode==="login"?"login":"register"),{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(form)
   });
   const d=await r.json();
   if(!r.ok){setError(d.error||"Kunne ikke fortsette.");return}
   if(d.verificationRequired){
    setInfo(d.message||"Bekreft e-postadressen før du logger inn.");
    setMode("login");
    setForm({...form,password:""});
    return;
   }
   await load();
  }finally{setBusy(false)}
 }

 async function resetPassword(){
  setError("");setInfo("");
  if(!form.email.trim()){setError("Skriv inn e-postadressen din først.");return}
  setBusy(true);
  try{
   const r=await fetch("/api/customer/reset-password",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email:form.email})
   });
   const d=await r.json();
   setInfo(d.message||"Hvis e-postadressen er registrert, sender vi en lenke.");
  }catch{setError("Kunne ikke sende lenken akkurat nå.")}
  finally{setBusy(false)}
 }

 async function logout(){
  await fetch("/api/customer/logout",{method:"POST"});
  setData(null);setMode("login");
 }

 if(loading)return <main className="customerPage"><p>Laster …</p></main>;

 if(!data)return <main className="customerPage customerLoginPage">
  <Link href="/">← Aadland Service</Link>
  <div className="kicker customerTopKicker">MIN SIDE</div>
  <h1>{mode==="login"?"Logg inn":"Opprett kundekonto"}</h1>
  <p>Det er frivillig å ha konto. Med Min side kan du samle tilbud, oppdrag, kjøp og utleie på ett sted.</p>
  <form className="card customerLoginCard" onSubmit={submit}>
   {mode==="register"&&<>
    <div className="field"><label>Navn</label><input required maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
    <div className="field"><label>Telefon</label><input maxLength={40} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></div>
    <div className="field"><label>Adresse</label><input maxLength={300} value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></div>
   </>}
   <div className="field"><label>E-post</label><input required maxLength={254} type="email" autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div>
   <div className="field"><label>Passord</label><input required minLength={8} maxLength={128} type="password" autoComplete={mode==="login"?"current-password":"new-password"} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></div>
   {error&&<p className="notice">{error}</p>}
   {info&&<p className="success">{info}</p>}
   <button className="btn" disabled={busy}>{busy?"Vent litt …":mode==="login"?"Logg inn":"Opprett konto"}</button>
  </form>
  <div className="customerLoginActions">
   {mode==="login"&&<button type="button" className="btn alt" disabled={busy} onClick={resetPassword}>Glemt passord?</button>}
   <button className="btn alt" onClick={()=>{setError("");setInfo("");setMode(mode==="login"?"register":"login")}}>{mode==="login"?"Ny kunde? Opprett konto":"Har du konto? Logg inn"}</button>
  </div>
 </main>;

 const quotes=data.quotes||[];
 const jobs=(data.orders||[]).filter(order=>order.order_type==="custom");
 const purchases=(data.orders||[]).filter(order=>order.order_type!=="custom");

 return <main className="customerPage">
  <Link href="/">← Aadland Service</Link>
  <header className="customerDashboardHeader">
   <div>
    <div className="kicker">MIN SIDE</div>
    <h1>Hei, {data.customer.name||"kunde"}</h1>
    <p>{data.customer.email}</p>
   </div>
   <button className="btn alt" onClick={logout}>Logg ut</button>
  </header>

  <section className="customerDashboardSection">
   <div className="customerSectionHead">
    <div><div className="kicker">DOKUMENTER</div><h2>Tilbud</h2></div>
    <span>{quotes.length}</span>
   </div>
   {!quotes.length?<div className="card customerEmpty"><p>Ingen tilbud knyttet til kontoen ennå.</p></div>:
   <div className="customerGrid">
    {quotes.map(q=>{
     const status=effectiveQuoteStatus(q);
     return <article className="card customerQuoteCard" key={q.id}>
      <div className="customerCardTop">
       <div><small>{q.quoteNumber}</small><h3>{q.title}</h3></div>
       <span className={"customerStatus customerStatus-"+status}>{quoteStatus[status]||status}</span>
      </div>
      <div className="customerCardMeta">
       <span><small>Total inkl. MVA</small><b>{kr(q.totalIncVatOre)}</b></span>
       <span><small>{q.validUntil?"Gyldig til":"Sendt"}</small><b>{q.validUntil?date(q.validUntil):dateTime(q.sentAt||q.createdAt)}</b></span>
       {q.plannedStartDate&&<span><small>Tidligst oppstart</small><b>{date(q.plannedStartDate)}</b></span>}
      </div>
      {status==="accepted"&&<p className="customerQuoteMessage">Tilbudet er godkjent.</p>}
      {status==="declined"&&<p className="customerQuoteMessage">Tilbudet er avslått.</p>}
      {status==="expired"&&<p className="customerQuoteMessage">Tilbudets gyldighetsdato er passert.</p>}
      <Link className="btn" href={q.href}>Åpne tilbud</Link>
     </article>
    })}
   </div>}
  </section>

  <section className="customerDashboardSection customerJobsSection">
   <div className="customerSectionHead">
    <div><div className="kicker">MINE OPPDRAG</div><h2>Oppdrag</h2></div>
    <span>{jobs.length}</span>
   </div>
   {!jobs.length?<div className="card customerEmpty"><p>Ingen aktive eller tidligere oppdrag knyttet til kontoen ennå.</p></div>:
   <div className="customerJobGrid">{jobs.map(o=>{
    const q=o.source_quote;
    return <article className="card customerJobCard" key={o.id}>
     <div className="customerCardTop">
      <div><small>{o.order_number}{q?.quoteNumber?" · "+q.quoteNumber:""}</small><h3>{q?.title||"Oppdrag"}</h3></div>
      <span className="customerStatus">{orderStatus[o.status]||o.status}</span>
     </div>

     {o.job_start_at?<div className="customerJobStart">
      <small>AVTALT OPPSTART</small>
      <b>{dateTimeFull(o.job_start_at)}</b>
      {o.job_confirmation_sent_at&&<span>Bekreftet på e-post {dateTime(o.job_confirmation_sent_at)}</span>}
     </div>:q?.earliestStartDate?<div className="customerJobStart customerJobStartPending">
      <small>TIDLIGST OPPSTART I TILBUDET</small>
      <b>{date(q.earliestStartDate)}</b>
      <span>Endelig oppstart er ikke avtalt ennå.</span>
     </div>:<div className="customerJobStart customerJobStartPending">
      <small>OPPSTART</small>
      <b>Ikke avtalt ennå</b>
      <span>Vi tar kontakt når oppstart skal avtales.</span>
     </div>}

     {o.job_customer_agreement&&<div className="customerJobAgreement">
      <small>DETTE ER AVTALT VIDERE</small>
      <p>{o.job_customer_agreement}</p>
      {o.job_planning_updated_at&&<span>Sist oppdatert {dateTimeFull(o.job_planning_updated_at)}</span>}
     </div>}

     <div className="customerCardMeta">
      <span><small>Avtalt total</small><b>{kr(q?.totalIncVatOre||o.total_ore)}</b></span>
      <span><small>Betaling</small><b>{paymentStatus[o.payment_status]||o.payment_status||"Ikke registrert"}</b></span>
     </div>

     {Array.isArray(q?.paymentPlan)&&q.paymentPlan.length>0&&<div className="customerJobPaymentPlan">
      <h4>Betalingsplan</h4>
      {q.paymentPlan.map((row,index)=><div key={row.id||index}>
       <span><b>{row.label||("Delbetaling "+(index+1))}</b><small>{row.trigger||""}</small></span>
       <strong>{row.percent}% · {kr((q.totalIncVatOre||o.total_ore)*(Number(row.percent)||0)/100)}</strong>
      </div>)}
     </div>}

     {q?.href&&<Link className="btn alt" href={q.href}>Åpne godkjent tilbud</Link>}
    </article>;
   })}</div>}
  </section>

  <section className="customerDashboardSection">
   <div className="customerSectionHead"><div><div className="kicker">HANDEL</div><h2>Bestillinger</h2></div><span>{purchases.length}</span></div>
   {!purchases.length?<div className="card customerEmpty"><p>Ingen produktbestillinger knyttet til kontoen ennå.</p></div>:
   <div className="customerGrid">{purchases.map(o=><article className="card customerHistoryCard" key={o.id}>
    <div className="customerCardTop"><div><small>{o.order_number}</small><h3>Bestilling</h3></div><span className="customerStatus">{orderStatus[o.status]||o.status}</span></div>
    <div className="customerCardMeta"><span><small>Sum</small><b>{kr(o.total_ore)}</b></span><span><small>Betaling</small><b>{paymentStatus[o.payment_status]||o.payment_status||"Ikke registrert"}</b></span></div>
   </article>)}</div>}
  </section>

  <section className="customerDashboardSection">
   <div className="customerSectionHead"><div><div className="kicker">UTLEIE</div><h2>Utleie</h2></div><span>{data.rentals.length}</span></div>
   {!data.rentals.length?<div className="card customerEmpty"><p>Ingen utleier knyttet til kontoen ennå.</p></div>:
   <div className="customerGrid">{data.rentals.map(r=><article className="card customerHistoryCard" key={r.id}>
    <div className="customerCardTop"><div><small>{r.booking_number}</small><h3>{r.rental_items?.name||"Utleie"}</h3></div><span className="customerStatus">{rentalStatus[r.status]||r.status}</span></div>
    <div className="customerCardMeta"><span><small>Periode</small><b>{date(r.start_date)} – {date(r.end_date)}</b></span><span><small>Sum</small><b>{kr(r.total_ore)}</b></span></div>
   </article>)}</div>}
  </section>
 </main>;
}
