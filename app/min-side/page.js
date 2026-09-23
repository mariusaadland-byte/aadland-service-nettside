"use client";

import {useEffect,useState} from "react";
import Link from "next/link";

const orderStatus={new:"Mottatt",confirmed:"Bekreftet",processing:"Under behandling",in_progress:"Under arbeid",ready:"Klar",completed:"Fullført",cancelled:"Kansellert"};
const enquiryStatus={new:"Mottatt",confirmed:"Befaring avtalt",processing:"Under behandling",in_progress:"Under arbeid",ready:"Klar for oppfølging",completed:"Ferdig",cancelled:"Avbrutt"};
const rentalStatus={new:"Mottatt",confirmed:"Bekreftet",active:"Pågående",returned:"Returnert",completed:"Fullført",cancelled:"Kansellert"};
const quoteStatus={sent:"Sendt",accepted:"Godkjent",declined:"Avslått",expired:"Utløpt",cancelled:"Avbrutt"};
const paymentStatus={unpaid:"Ikke betalt",pending:"Avventer betaling",authorized:"Reservert",partial:"Delvis betalt",paid:"Betalt",refunded:"Refundert"};
const depositStatus={not_paid:"Ikke mottatt",held:"Holdes",released:"Frigitt",partially_charged:"Delvis trukket",charged:"Trukket"};
const fulfillmentStatus={pickup:"Henting",delivery:"Levering",shipping:"Post / Bring"};

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
 const [editingProfile,setEditingProfile]=useState(false);
 const [profileForm,setProfileForm]=useState({name:"",phone:"",address:""});

 async function load(){
  try{
   const r=await fetch("/api/customer/me");
   const d=await r.json();
   if(r.ok){
    setData(d);
    setProfileForm({
     name:d.customer?.name||"",
     phone:d.customer?.phone||"",
     address:d.customer?.address||""
    });
   }else setData(null);
  }finally{setLoading(false)}
 }

 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  const verification=params.get("verification");
  if(verification==="success")setInfo("E-postadressen er bekreftet. Velkommen til Min side.");
  if(verification==="invalid")setError("Bekreftelseslenken er ugyldig eller utløpt.");
  if(verification==="error")setError("E-postadressen kunne ikke bekreftes akkurat nå. Prøv igjen.");
  load();
 },[]);

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

 async function resendVerification(){
  setError("");setInfo("");
  if(!form.email.trim()){setError("Skriv inn e-postadressen din først.");return}
  setBusy(true);
  try{
   const r=await fetch("/api/customer/resend-verification",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email:form.email})
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok){setError(d.error||"Kunne ikke sende ny bekreftelsesmail.");return}
   setInfo(d.message||"Hvis kontoen venter på bekreftelse, sender vi en ny mail.");
  }catch{setError("Kunne ikke sende ny bekreftelsesmail akkurat nå.")}
  finally{setBusy(false)}
 }

 async function saveProfile(e){
  e.preventDefault();
  setBusy(true);setError("");setInfo("");
  try{
   const r=await fetch("/api/customer/profile",{
    method:"PATCH",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(profileForm)
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok){setError(d.error||"Kundeopplysningene kunne ikke lagres.");return}
   setData(current=>current?{...current,customer:d.customer}:current);
   setEditingProfile(false);
   setInfo("Kundeopplysningene er oppdatert.");
  }catch{
   setError("Kundeopplysningene kunne ikke lagres akkurat nå.");
  }finally{
   setBusy(false);
  }
 }

 async function sendLoggedInPasswordReset(){
  setBusy(true);setError("");setInfo("");
  try{
   const r=await fetch("/api/customer/reset-password",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email:data?.customer?.email||""})
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok){setError(d.error||"Kunne ikke sende passordlenken.");return}
   setInfo(d.message||"Vi har sendt en lenke for å velge nytt passord.");
  }catch{
   setError("Kunne ikke sende passordlenken akkurat nå.");
  }finally{
   setBusy(false);
  }
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
   {mode==="login"&&<button type="button" className="btn alt" disabled={busy} onClick={resendVerification}>Send bekreftelsesmail på nytt</button>}
   <button className="btn alt" onClick={()=>{setError("");setInfo("");setMode(mode==="login"?"register":"login")}}>{mode==="login"?"Ny kunde? Opprett konto":"Har du konto? Logg inn"}</button>
  </div>
 </main>;

 const quotes=data.quotes||[];
 const customOrders=(data.orders||[]).filter(order=>order.order_type==="custom");
 const jobs=customOrders.filter(order=>Boolean(order.source_quote));
 const enquiries=customOrders.filter(order=>!order.source_quote);
 const purchases=(data.orders||[]).filter(order=>order.order_type!=="custom");
 const rentals=data.rentals||[];
 const openQuotes=quotes.filter(q=>effectiveQuoteStatus(q)==="sent").length;
 const openEnquiries=enquiries.filter(o=>!["completed","cancelled"].includes(o.status)).length;
 const activeJobs=jobs.filter(o=>!["completed","cancelled"].includes(o.status)).length;
 const activePurchases=purchases.filter(o=>!["completed","cancelled"].includes(o.status)).length;
 const activeRentals=rentals.filter(r=>["new","confirmed","active"].includes(r.status)).length;
 const recentActivity=[
  ...quotes.map(q=>({
   key:"quote-"+q.id,
   type:"Tilbud",
   title:q.title||"Tilbud",
   meta:q.quoteNumber||"",
   date:q.acceptedAt||q.declinedAt||q.sentAt||q.createdAt,
   status:quoteStatus[effectiveQuoteStatus(q)]||effectiveQuoteStatus(q),
   href:q.href||"#tilbud"
  })),
  ...enquiries.map(o=>({
   key:"enquiry-"+o.id,
   type:"Forespørsel",
   title:"Befaring / forespørsel",
   meta:o.order_number||"",
   date:o.created_at,
   status:enquiryStatus[o.status]||o.status,
   href:"#foresporsler"
  })),
  ...jobs.map(o=>({
   key:"job-"+o.id,
   type:"Oppdrag",
   title:o.source_quote?.title||"Oppdrag",
   meta:o.order_number||"",
   date:o.job_planning_updated_at||o.created_at,
   status:orderStatus[o.status]||o.status,
   href:"#oppdrag"
  })),
  ...purchases.map(o=>({
   key:"purchase-"+o.id,
   type:"Bestilling",
   title:(Array.isArray(o.items)&&o.items[0]?.name)||"Produktbestilling",
   meta:o.order_number||"",
   date:o.created_at,
   status:orderStatus[o.status]||o.status,
   href:"#bestillinger"
  })),
  ...rentals.map(r=>({
   key:"rental-"+r.id,
   type:"Utleie",
   title:r.rental_items?.name||"Utleie",
   meta:r.booking_number||"",
   date:r.created_at,
   status:rentalStatus[r.status]||r.status,
   href:"#utleie"
  }))
 ].filter(item=>item.date).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);

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
  {info&&<p className="success customerDashboardNotice">{info}</p>}
  {error&&<p className="notice customerDashboardNotice">{error}</p>}

  <nav className="customerOverview" aria-label="Oversikt over Min side">
   <a href="#foresporsler"><small>FORESPØRSLER</small><b>{openEnquiries}</b><span>aktive nå</span></a>
   <a href="#tilbud"><small>ÅPNE TILBUD</small><b>{openQuotes}</b><span>{openQuotes===1?"tilbud venter":"tilbud venter"}</span></a>
   <a href="#oppdrag"><small>AKTIVE OPPDRAG</small><b>{activeJobs}</b><span>{activeJobs===1?"oppdrag":"oppdrag"}</span></a>
   <a href="#bestillinger"><small>BESTILLINGER</small><b>{activePurchases}</b><span>aktive nå</span></a>
   <a href="#utleie"><small>UTLEIE</small><b>{activeRentals}</b><span>aktive nå</span></a>
  </nav>

  {recentActivity.length>0&&<section className="customerDashboardSection customerRecentActivity">
   <div className="customerSectionHead">
    <div><div className="kicker">SISTE NYTT</div><h2>Siste aktivitet</h2></div>
   </div>
   <div className="customerActivityList">
    {recentActivity.map(item=><a className="customerActivityItem" href={item.href} key={item.key}>
     <span className="customerActivityType">{item.type}</span>
     <span className="customerActivityMain"><b>{item.title}</b><small>{item.meta}{item.meta?" · ":""}{dateTime(item.date)}</small></span>
     <span className="customerActivityStatus">{item.status}</span>
     <span className="customerActivityArrow">→</span>
    </a>)}
   </div>
  </section>}

  <section id="konto" className="customerDashboardSection customerAccountSection">
   <div className="customerSectionHead">
    <div><div className="kicker">KONTO</div><h2>Mine opplysninger</h2></div>
    {!editingProfile&&<button type="button" className="btn alt customerEditProfileButton" onClick={()=>setEditingProfile(true)}>Rediger</button>}
   </div>

   {!editingProfile?<div className="card customerAccountCard">
    <div className="customerAccountFacts">
     <span><small>Navn</small><b>{data.customer.name||"Ikke registrert"}</b></span>
     <span><small>E-post</small><b>{data.customer.email}</b></span>
     <span><small>Telefon</small><b>{data.customer.phone||"Ikke registrert"}</b></span>
     <span><small>Adresse</small><b>{data.customer.address||"Ikke registrert"}</b></span>
    </div>
    <div className="customerAccountActions">
     <button type="button" className="btn alt" disabled={busy} onClick={sendLoggedInPasswordReset}>{busy?"Vent litt …":"Endre passord"}</button>
    </div>
   </div>:<form className="card customerAccountCard customerAccountForm" onSubmit={saveProfile}>
    <div className="field"><label>Navn</label><input required maxLength={120} value={profileForm.name} onChange={e=>setProfileForm({...profileForm,name:e.target.value})}/></div>
    <div className="field"><label>E-post</label><input value={data.customer.email} disabled readOnly/></div>
    <div className="field"><label>Telefon</label><input maxLength={40} value={profileForm.phone} onChange={e=>setProfileForm({...profileForm,phone:e.target.value})}/></div>
    <div className="field"><label>Adresse</label><input maxLength={300} value={profileForm.address} onChange={e=>setProfileForm({...profileForm,address:e.target.value})}/></div>
    <div className="customerAccountActions">
     <button className="btn" disabled={busy}>{busy?"Lagrer …":"Lagre opplysninger"}</button>
     <button type="button" className="btn alt" disabled={busy} onClick={()=>{setEditingProfile(false);setProfileForm({name:data.customer.name||"",phone:data.customer.phone||"",address:data.customer.address||""})}}>Avbryt</button>
    </div>
   </form>}
  </section>

  <section id="foresporsler" className="customerDashboardSection">
   <div className="customerSectionHead">
    <div><div className="kicker">KONTAKT</div><h2>Forespørsler og befaring</h2></div>
    <div className="customerSectionActions"><span>{enquiries.length}</span><a className="btn alt" href="/#befaring">Ny forespørsel</a></div>
   </div>
   {!enquiries.length?<div className="card customerEmpty"><p>Ingen forespørsler knyttet til kontoen ennå.</p></div>:
   <div className="customerGrid">{enquiries.map(o=><article className="card customerHistoryCard" key={o.id}>
    <div className="customerCardTop">
     <div><small>{o.order_number}</small><h3>Befaring / forespørsel</h3><p className="customerHistoryDate">Sendt {dateTime(o.created_at)}</p></div>
     <span className={"customerStatus customerStatus-"+o.status}>{enquiryStatus[o.status]||o.status}</span>
    </div>
    {o.custom_request&&<p className="customerEnquiryText">{String(o.custom_request).split("\nBilder:\n")[0]}</p>}
    <div className="customerCardMeta">
     <span><small>Status</small><b>{enquiryStatus[o.status]||o.status}</b></span>
     {o.survey_date&&<span><small>Befaring</small><b>{dateTimeFull(o.survey_date)}</b></span>}
     {o.survey_confirmation_sent_at&&<span><small>Bekreftelse</small><b>Sendt {dateTime(o.survey_confirmation_sent_at)}</b></span>}
     {o.survey_reminder_sent_at&&<span><small>Påminnelse</small><b>Sendt {dateTime(o.survey_reminder_sent_at)}</b></span>}
    </div>
   </article>)}</div>}
  </section>

  <section id="tilbud" className="customerDashboardSection">
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

  <section id="oppdrag" className="customerDashboardSection customerJobsSection">
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
      <span className={"customerStatus customerStatus-"+o.status}>{orderStatus[o.status]||o.status}</span>
     </div>

     {o.job_start_at?<div className="customerJobStart">
      <small>AVTALT OPPSTART</small>
      <b>{dateTimeFull(o.job_start_at)}</b>
      {o.job_confirmation_sent_at&&<span>Bekreftet på e-post {dateTime(o.job_confirmation_sent_at)}</span>}
      {o.job_reminder_sent_at&&<span>Påminnelse sendt {dateTime(o.job_reminder_sent_at)}</span>}
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

  <section id="bestillinger" className="customerDashboardSection">
   <div className="customerSectionHead"><div><div className="kicker">HANDEL</div><h2>Bestillinger</h2></div><span>{purchases.length}</span></div>
   {!purchases.length?<div className="card customerEmpty"><p>Ingen produktbestillinger knyttet til kontoen ennå.</p></div>:
   <div className="customerGrid">{purchases.map(o=><article className="card customerHistoryCard" key={o.id}>
    <div className="customerCardTop"><div><small>{o.order_number}</small><h3>Bestilling</h3><p className="customerHistoryDate">Bestilt {dateTime(o.created_at)}</p></div><span className={"customerStatus customerStatus-"+o.status}>{orderStatus[o.status]||o.status}</span></div>
    {Array.isArray(o.items)&&o.items.length>0&&<div className="customerItemList">
     {o.items.slice(0,6).map((item,index)=><div key={(item.productId||item.name||"item")+"-"+index}><span><b>{item.name||"Produkt"}</b><small>Antall {item.quantity||1}</small></span><strong>{kr((Number(item.unitPriceOre)||0)*(Number(item.quantity)||1))}</strong></div>)}
     {o.items.length>6&&<small>+ {o.items.length-6} flere varelinjer</small>}
    </div>}
    <div className="customerCardMeta">
     <span><small>Sum</small><b>{kr(o.total_ore)}</b></span>
     <span><small>Betaling</small><b>{paymentStatus[o.payment_status]||o.payment_status||"Ikke registrert"}</b></span>
     <span><small>Levering</small><b>{fulfillmentStatus[o.fulfillment_type]||o.fulfillment_type||"Ikke registrert"}</b></span>
     {Number(o.shipping_ore)>0&&<span><small>Frakt</small><b>{kr(o.shipping_ore)}</b></span>}
    </div>
   </article>)}</div>}
  </section>

  <section id="utleie" className="customerDashboardSection">
   <div className="customerSectionHead"><div><div className="kicker">UTLEIE</div><h2>Utleie</h2></div><span>{rentals.length}</span></div>
   {!rentals.length?<div className="card customerEmpty"><p>Ingen utleier knyttet til kontoen ennå.</p></div>:
   <div className="customerGrid">{rentals.map(r=><article className="card customerHistoryCard" key={r.id}>
    <div className="customerCardTop"><div><small>{r.booking_number}</small><h3>{r.rental_items?.name||"Utleie"}</h3><p className="customerHistoryDate">Booket {dateTime(r.created_at)}</p></div><span className={"customerStatus customerStatus-"+r.status}>{rentalStatus[r.status]||r.status}</span></div>
    <div className="customerCardMeta">
     <span><small>Periode</small><b>{date(r.start_date)} – {date(r.end_date)}</b></span>
     <span><small>Leiepris</small><b>{kr(r.total_ore)}</b></span>
     <span><small>Betaling</small><b>{paymentStatus[r.payment_status]||r.payment_status||"Ikke registrert"}</b></span>
     <span><small>Utlevering</small><b>{fulfillmentStatus[r.customer?.fulfillment]||"Ikke registrert"}</b></span>
     {Number(r.deposit_ore)>0&&<span><small>Depositum</small><b>{kr(r.deposit_ore)} · {depositStatus[r.deposit_status]||r.deposit_status||"Ikke registrert"}</b></span>}
    </div>
   </article>)}</div>}
  </section>
 </main>;
}
