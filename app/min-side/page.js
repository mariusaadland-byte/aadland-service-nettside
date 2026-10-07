"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {osloDateKey} from "../../lib/osloTime";
import CustomerDrawingViewer from "./CustomerDrawingViewer";

const orderStatus={new:"Mottatt",confirmed:"Bekreftet",processing:"Under behandling",in_progress:"Under arbeid",ready:"Klar",completed:"Fullført",cancelled:"Kansellert"};
const enquiryStatus={new:"Mottatt",confirmed:"Befaring avtalt",processing:"Under behandling",in_progress:"Under arbeid",ready:"Klar for oppfølging",completed:"Ferdig",cancelled:"Avbrutt"};
const rentalStatus={new:"Mottatt",confirmed:"Bekreftet",active:"Pågående",returned:"Returnert",completed:"Fullført",cancelled:"Kansellert"};
const quoteStatus={sent:"Sendt",accepted:"Godkjent",declined:"Avslått",expired:"Utløpt",cancelled:"Avbrutt",superseded:"Erstattet"};
const paymentStatus={unpaid:"Ikke betalt",pending:"Avventer betaling",authorized:"Reservert",partial:"Delvis betalt",paid:"Betalt",refunded:"Refundert"};
const depositStatus={not_paid:"Ikke mottatt",held:"Holdes",released:"Frigitt",partially_charged:"Delvis trukket",charged:"Trukket"};
const fulfillmentStatus={pickup:"Henting",delivery:"Levering",shipping:"Post / Bring"};
const rentalDisplayStatus=r=>r?.status==="confirmed"&&!r?.confirmation_sent_at?"Reservert":(rentalStatus[r?.status]||r?.status||"");

const date=v=>v?new Intl.DateTimeFormat("nb-NO").format(new Date(v+"T12:00:00")):"";
const dateTime=v=>v?new Intl.DateTimeFormat("nb-NO",{dateStyle:"medium"}).format(new Date(v)):"";
const dateTimeFull=v=>v?new Intl.DateTimeFormat("nb-NO",{dateStyle:"long",timeStyle:"short"}).format(new Date(v)):"";
const kr=o=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format((Number(o)||0)/100);
const effectiveQuoteStatus=q=>{
 if(q.status==="sent"&&q.validUntil&&q.validUntil<osloDateKey(new Date()))return "expired";
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
 const [rentalContext,setRentalContext]=useState(false);
 const [activePanel,setActivePanel]=useState("overview");
 const [portalMenuOpen,setPortalMenuOpen]=useState(false);
 const [serviceVippsAvailable,setServiceVippsAvailable]=useState(false);
 const [rentalVippsAvailable,setRentalVippsAvailable]=useState(false);
 const [paymentBusyId,setPaymentBusyId]=useState("");

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
  const host=String(window.location.hostname||"").toLowerCase();
  setRentalContext(host==="aadlandutleie.no"||host==="www.aadlandutleie.no");
  const params=new URLSearchParams(window.location.search);
  const verification=params.get("verification");
  if(verification==="success")setInfo("E-postadressen er bekreftet. Velkommen til Min side.");
  if(verification==="invalid")setError("Bekreftelseslenken er ugyldig eller utløpt.");
  if(verification==="error")setError("E-postadressen kunne ikke bekreftes akkurat nå. Prøv igjen.");
  fetch("/api/payment-options")
   .then(async response=>{
    const options=await response.json().catch(()=>({}));
    if(response.ok){
     setServiceVippsAvailable(options?.vipps?.service===true);
     setRentalVippsAvailable(options?.vipps?.rental===true);
    }
   })
   .catch(()=>{});
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

 function repeatPurchase(item){
  if(!item?.productSlug)return;
  try{
   sessionStorage.setItem("aadlandRepeatPurchase",JSON.stringify({
    slug:item.productSlug,
    productId:item.productId||"",
    quantity:Number(item.quantity)||1,
    selectedOptions:item.selectedOptions&&typeof item.selectedOptions==="object"?item.selectedOptions:{}
   }));
  }catch{}
  window.location.href="/produkter/"+encodeURIComponent(item.productSlug);
 }

 async function resumeOrderVipps(order){
  setError("");setInfo("");
  setPaymentBusyId(order.id);
  try{
   const response=await fetch("/api/customer/order-vipps",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({orderId:order.id})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok){
    setError(result.error||"Vipps-betalingen kunne ikke åpnes.");
    await load();
    return;
   }
   if(!result.redirectUrl){setError("Vipps svarte uten betalingslenke. Prøv igjen.");return;}
   window.location.assign(result.redirectUrl);
  }catch{
   setError("Vipps-betalingen kunne ikke åpnes akkurat nå.");
  }finally{
   setPaymentBusyId("");
  }
 }

 async function startRentalVipps(rental){
  setError("");setInfo("");
  setPaymentBusyId(rental.id);
  try{
   const response=await fetch("/api/customer/rental-vipps",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({bookingId:rental.id})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok){
    setError(result.error||"Vipps-betalingen kunne ikke startes.");
    await load();
    return;
   }
   if(!result.redirectUrl){setError("Vipps svarte uten betalingslenke. Prøv igjen.");return;}
   window.location.assign(result.redirectUrl);
  }catch{
   setError("Vipps-betalingen kunne ikke startes akkurat nå.");
  }finally{
   setPaymentBusyId("");
  }
 }

 function repeatRental(rental){
  const slug=rental?.rental_items?.slug;
  if(!slug)return;
  try{
   sessionStorage.setItem("aadlandRepeatRental",JSON.stringify({
    slug,
    fulfillment:rental?.customer?.fulfillment==="delivery"?"delivery":"pickup"
   }));
  }catch{}
  window.location.href="/utleie/"+encodeURIComponent(slug);
 }

 function selectPanel(id){
  setActivePanel(id);
  setPortalMenuOpen(false);
  window.setTimeout(()=>{
   document.querySelector(".customerPortalContent")?.scrollIntoView({behavior:"smooth",block:"start"});
  },40);
 }

 if(loading)return <main className="customerPage"><p>Laster …</p></main>;

 if(!data)return <main className="customerPage customerLoginPage">
  <Link href={rentalContext?"/utleie":"/"}>← {rentalContext?"Aadland Utleie":"Aadland Service"}</Link>
  <div className="kicker customerTopKicker">{rentalContext?"AADLAND UTLEIE · MIN SIDE":"MIN SIDE"}</div>
  <h1>{mode==="login"?"Logg inn":"Opprett kundekonto"}</h1>
  <p>{rentalContext
   ?"Det er frivillig å ha konto. Med Min side kan du følge utleiebookinger og administrere kontaktopplysningene dine. Kontoen er den samme som hos Aadland Service."
   :"Det er frivillig å ha konto. Med Min side kan du samle tilbud, oppdrag, kjøp og utleie på ett sted."}</p>
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
 const drawings=data.drawings||[];
 const activeEnquiries=[...enquiries].filter(o=>!["completed","cancelled"].includes(o.status)).sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
 const pastEnquiries=[...enquiries].filter(o=>["completed","cancelled"].includes(o.status)).sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
 const activeQuotes=[...quotes].filter(q=>effectiveQuoteStatus(q)==="sent").sort((a,b)=>String(b.sentAt||b.createdAt||"").localeCompare(String(a.sentAt||a.createdAt||"")));
 const pastQuotes=[...quotes].filter(q=>effectiveQuoteStatus(q)!=="sent").sort((a,b)=>String(b.acceptedAt||b.declinedAt||b.sentAt||b.createdAt||"").localeCompare(String(a.acceptedAt||a.declinedAt||a.sentAt||a.createdAt||"")));
 const activeJobRows=[...jobs].filter(o=>!["completed","cancelled"].includes(o.status)).sort((a,b)=>{
  const ax=String(a.job_start_at||"9999-12-31"),bx=String(b.job_start_at||"9999-12-31");
  return ax===bx?String(b.created_at||"").localeCompare(String(a.created_at||"")):ax.localeCompare(bx);
 });
 const pastJobRows=[...jobs].filter(o=>["completed","cancelled"].includes(o.status)).sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
 const activePurchaseRows=[...purchases].filter(o=>!["completed","cancelled"].includes(o.status)).sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
 const pastPurchaseRows=[...purchases].filter(o=>["completed","cancelled"].includes(o.status)).sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
 const rentalToday=osloDateKey(new Date());
 const rentalIsPast=r=>["completed","cancelled","returned"].includes(r.status)||String(r.end_date||"")<rentalToday;
 const upcomingRentals=[...rentals].filter(r=>!rentalIsPast(r)).sort((a,b)=>String(a.start_date||"").localeCompare(String(b.start_date||"")));
 const pastRentals=[...rentals].filter(r=>rentalIsPast(r)).sort((a,b)=>String(b.start_date||"").localeCompare(String(a.start_date||"")));
 const openQuotes=quotes.filter(q=>effectiveQuoteStatus(q)==="sent").length;
 const openEnquiries=enquiries.filter(o=>!["completed","cancelled"].includes(o.status)).length;
 const activeJobs=jobs.filter(o=>!["completed","cancelled"].includes(o.status)).length;
 const activePurchases=purchases.filter(o=>!["completed","cancelled"].includes(o.status)).length;
 const activeRentals=rentals.filter(r=>["new","confirmed","active"].includes(r.status)).length;
 const visibleDrawings=drawings.length;
 const pendingRentalRows=rentals.filter(r=>r.status==="confirmed"&&!r.confirmation_sent_at);
 const readyPurchaseRows=purchases.filter(o=>o.status==="ready");
 const portalAttentionCount=openQuotes+pendingRentalRows.length+readyPurchaseRows.length;
 const recentActivity=[
  ...quotes.map(q=>({
   key:"quote-"+q.id,
   type:"Tilbud",
   title:q.title||"Tilbud",
   meta:(q.quoteNumber||"")+(q.revisionNumber>1?" · Revisjon "+q.revisionNumber:""),
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
   status:rentalDisplayStatus(r),
   href:"#utleie"
  }))
 ].filter(item=>item.date).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,6);

 return <main className="customerPage customerPortalPage">
  <header className="customerPortalTopbar">
   <Link className="customerPortalBack" href={rentalContext?"/utleie":"/"}>← {rentalContext?"Aadland Utleie":"Aadland Service"}</Link>
   <button type="button" className="customerPortalLogout" onClick={logout}>Logg ut</button>
  </header>

  <div className="customerPortalLayout">
   <aside className="customerPortalSidebar">
    <div className="customerPortalIdentityRow">
     <div className="customerPortalIdentity">
      <span className="customerPortalAvatar">{String(data.customer.name||"K").trim().charAt(0).toUpperCase()}</span>
      <div>
       <small>{rentalContext?"AADLAND UTLEIE · MIN SIDE":"MIN SIDE"}</small>
       <b>{data.customer.name||"Kunde"}</b>
       <span>{data.customer.email}</span>
      </div>
     </div>
     <button
      type="button"
      className={"customerPortalMenuButton "+(portalMenuOpen?"isOpen":"")}
      aria-label={portalMenuOpen?"Lukk meny":"Åpne meny"}
      aria-expanded={portalMenuOpen}
      onClick={()=>setPortalMenuOpen(v=>!v)}
     >
      <span></span><span></span><span></span>
     </button>
    </div>

    <nav className={"customerPortalNav "+(portalMenuOpen?"isOpen":"")} aria-label="Min side">
     <button type="button" className={activePanel==="overview"?"isActive":""} onClick={()=>selectPanel("overview")}><span>Oversikt</span></button>
     <button type="button" className={activePanel==="foresporsler"?"isActive":""} onClick={()=>selectPanel("foresporsler")}><span>Forespørsler</span><b>{openEnquiries}</b></button>
     <button type="button" className={activePanel==="tilbud"?"isActive":""} onClick={()=>selectPanel("tilbud")}><span>Tilbud</span><b>{openQuotes}</b></button>
     <button type="button" className={activePanel==="oppdrag"?"isActive":""} onClick={()=>selectPanel("oppdrag")}><span>Oppdrag</span><b>{activeJobs}</b></button>
     <button type="button" className={activePanel==="tegninger"?"isActive":""} onClick={()=>selectPanel("tegninger")}><span>Tegninger</span><b>{visibleDrawings}</b></button>
     <button type="button" className={activePanel==="bestillinger"?"isActive":""} onClick={()=>selectPanel("bestillinger")}><span>Bestillinger</span><b>{activePurchases}</b></button>
     <button type="button" className={activePanel==="utleie"?"isActive":""} onClick={()=>selectPanel("utleie")}><span>Utleie</span><b>{activeRentals}</b></button>
     <button type="button" className={activePanel==="konto"?"isActive":""} onClick={()=>selectPanel("konto")}><span>Mine opplysninger</span></button>
    </nav>
   </aside>

   <div className="customerPortalContent">
    {info&&<p className="success customerDashboardNotice">{info}</p>}
    {error&&<p className="notice customerDashboardNotice">{error}</p>}

    {activePanel==="overview"&&<section className="customerPortalOverview">
     <div className="customerPortalWelcome">
      <div className="kicker">OVERSIKT</div>
      <h1>Hei, {(data.customer.name||"kunde").split(" ")[0]}</h1>
      <p>Her finner du det viktigste samlet – tilbud, oppdrag, bestillinger og utleie.</p>
     </div>

     {portalAttentionCount>0&&<div className="customerPortalAttention">
      <div className="customerPortalBlockHead">
       <div><div className="kicker">FØLG OPP</div><h2>Dette bør du se på</h2></div>
       <span>{portalAttentionCount}</span>
      </div>
      <div className="customerPortalAttentionList">
       {openQuotes>0&&<button type="button" onClick={()=>selectPanel("tilbud")}><span><b>{openQuotes===1?"Ett tilbud venter på svar":openQuotes+" tilbud venter på svar"}</b><small>Åpne tilbud og se frist, pris og detaljer.</small></span><strong>→</strong></button>}
       {pendingRentalRows.length>0&&<button type="button" onClick={()=>selectPanel("utleie")}><span><b>{pendingRentalRows.length===1?"Én utleie venter på betaling/kreditt":pendingRentalRows.length+" utleier venter på betaling/kreditt"}</b><small>Perioden er reservert, men endelig bekreftelse er ikke sendt ennå.</small></span><strong>→</strong></button>}
       {readyPurchaseRows.length>0&&<button type="button" onClick={()=>selectPanel("bestillinger")}><span><b>{readyPurchaseRows.length===1?"Én bestilling er klar":readyPurchaseRows.length+" bestillinger er klare"}</b><small>Se levering/henting og siste status.</small></span><strong>→</strong></button>}
      </div>
     </div>}

     <div className="customerPortalStats">
      <button type="button" onClick={()=>selectPanel("foresporsler")}><small>FORESPØRSLER</small><b>{openEnquiries}</b><span>aktive</span></button>
      <button type="button" onClick={()=>selectPanel("tilbud")}><small>TILBUD</small><b>{openQuotes}</b><span>venter</span></button>
      <button type="button" onClick={()=>selectPanel("oppdrag")}><small>OPPDRAG</small><b>{activeJobs}</b><span>aktive</span></button>
      <button type="button" onClick={()=>selectPanel("tegninger")}><small>TEGNINGER</small><b>{visibleDrawings}</b><span>delt med deg</span></button>
      <button type="button" onClick={()=>selectPanel("bestillinger")}><small>BESTILLINGER</small><b>{activePurchases}</b><span>aktive</span></button>
      <button type="button" onClick={()=>selectPanel("utleie")}><small>UTLEIE</small><b>{activeRentals}</b><span>aktive</span></button>
     </div>

     {recentActivity.length>0&&<div className="customerPortalRecent">
      <div className="customerPortalBlockHead"><div><div className="kicker">SISTE NYTT</div><h2>Siste aktivitet</h2></div></div>
      <div className="customerActivityList">
       {recentActivity.map(item=><button type="button" className="customerActivityItem" onClick={()=>{
        const panel=item.type==="Tilbud"?"tilbud":item.type==="Forespørsel"?"foresporsler":item.type==="Oppdrag"?"oppdrag":item.type==="Bestilling"?"bestillinger":"utleie";
        selectPanel(panel);
       }} key={item.key}>
        <span className="customerActivityType">{item.type}</span>
        <span className="customerActivityMain"><b>{item.title}</b><small>{item.meta}{item.meta?" · ":""}{dateTime(item.date)}</small></span>
        <span className="customerActivityStatus">{item.status}</span>
        <span className="customerActivityArrow">→</span>
       </button>)}
      </div>
     </div>}

     <div className="customerPortalQuickActions">
      <a className="btn" href={rentalContext?"https://www.aadland-service.no/#befaring":"/#befaring"}>Ny forespørsel</a>
      <a className="btn alt" href={rentalContext?"https://www.aadland-service.no/produkter":"/produkter"}>Se produkter</a>
      <Link className="btn alt" href="/utleie">Se utleie</Link>
     </div>
    </section>}

  {activePanel==="konto"&&<section id="konto" className="customerDashboardSection customerAccountSection customerPortalPanel">
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
  </section>}

  {activePanel==="foresporsler"&&<section id="foresporsler" className="customerDashboardSection customerPortalPanel">
   <div className="customerSectionHead">
    <div><div className="kicker">KONTAKT</div><h2>Forespørsler og befaring</h2></div>
    <div className="customerSectionActions"><span>{enquiries.length}</span><a className="btn alt" href={rentalContext?"https://www.aadland-service.no/#befaring":"/#befaring"}>Ny forespørsel</a></div>
   </div>
   {!enquiries.length?<div className="card customerEmpty"><p>Ingen forespørsler knyttet til kontoen ennå.</p></div>:<>
    {activeEnquiries.length>0&&<div className="customerCompactGroup">
     <div className="customerCompactGroupHead"><h3>Aktive</h3><span>{activeEnquiries.length}</span></div>
     <div className="customerCompactList">
      {activeEnquiries.map(o=><details className="customerCompactRow" key={o.id}>
       <summary>
        <span className="customerCompactDate"><b>{dateTime(o.created_at)}</b><small>Sendt</small></span>
        <span className="customerCompactMain"><b>Befaring / forespørsel</b><small>{o.order_number}</small></span>
        <span className={"customerStatus customerStatus-"+o.status}>{enquiryStatus[o.status]||o.status}</span>
        <span className="customerCompactMeta">{o.survey_date?"Befaring "+dateTime(o.survey_date):"Åpne"}</span>
        <span className="customerCompactChevron">⌄</span>
       </summary>
       <div className="customerCompactDetails">
        {o.custom_request&&<p className="customerEnquiryText">{String(o.custom_request).split("\nBilder:\n")[0]}</p>}
        <div className="customerCardMeta">
         <span><small>Status</small><b>{enquiryStatus[o.status]||o.status}</b></span>
         {o.survey_date&&<span><small>Befaring</small><b>{dateTimeFull(o.survey_date)}</b></span>}
         {o.survey_confirmation_sent_at&&<span><small>Bekreftelse</small><b>Sendt {dateTime(o.survey_confirmation_sent_at)}</b></span>}
         {o.survey_reminder_sent_at&&<span><small>Påminnelse</small><b>Sendt {dateTime(o.survey_reminder_sent_at)}</b></span>}
        </div>
       </div>
      </details>)}
     </div>
    </div>}
    {pastEnquiries.length>0&&<div className="customerCompactGroup customerCompactHistory">
     <div className="customerCompactGroupHead"><h3>Historikk</h3><span>{pastEnquiries.length}</span></div>
     <div className="customerCompactList">
      {pastEnquiries.map(o=><details className="customerCompactRow" key={o.id}>
       <summary>
        <span className="customerCompactDate"><b>{dateTime(o.created_at)}</b><small>Sendt</small></span>
        <span className="customerCompactMain"><b>Befaring / forespørsel</b><small>{o.order_number}</small></span>
        <span className={"customerStatus customerStatus-"+o.status}>{enquiryStatus[o.status]||o.status}</span>
        <span className="customerCompactMeta">Historikk</span>
        <span className="customerCompactChevron">⌄</span>
       </summary>
       <div className="customerCompactDetails">
        {o.custom_request&&<p className="customerEnquiryText">{String(o.custom_request).split("\nBilder:\n")[0]}</p>}
        <div className="customerCardMeta">
         <span><small>Status</small><b>{enquiryStatus[o.status]||o.status}</b></span>
         {o.survey_date&&<span><small>Befaring</small><b>{dateTimeFull(o.survey_date)}</b></span>}
        </div>
       </div>
      </details>)}
     </div>
    </div>}
   </>}
  </section>}

  {activePanel==="tilbud"&&<section id="tilbud" className="customerDashboardSection customerPortalPanel">
   <div className="customerSectionHead">
    <div><div className="kicker">DOKUMENTER</div><h2>Tilbud</h2></div>
    <span>{quotes.length}</span>
   </div>
   {!quotes.length?<div className="card customerEmpty"><p>Ingen tilbud knyttet til kontoen ennå.</p></div>:<>
    {activeQuotes.length>0&&<div className="customerCompactGroup">
     <div className="customerCompactGroupHead"><h3>Venter på svar</h3><span>{activeQuotes.length}</span></div>
     <div className="customerCompactList">
      {activeQuotes.map(q=>{
       const status=effectiveQuoteStatus(q);
       return <details className="customerCompactRow customerCompactRowAction" key={q.id}>
        <summary>
         <span className="customerCompactDate"><b>{dateTime(q.sentAt||q.createdAt)}</b><small>Sendt</small></span>
         <span className="customerCompactMain"><b>{q.title}</b><small>{q.quoteNumber}{q.revisionNumber>1?" · Revisjon "+q.revisionNumber:""}</small></span>
         <span className={"customerStatus customerStatus-"+status}>{quoteStatus[status]||status}</span>
         <span className="customerCompactMeta">{kr(q.totalIncVatOre)}</span>
         <span className="customerCompactChevron">⌄</span>
        </summary>
        <div className="customerCompactDetails">
         <div className="customerCardMeta">
          <span><small>Total inkl. MVA</small><b>{kr(q.totalIncVatOre)}</b></span>
          <span><small>{q.validUntil?"Gyldig til":"Sendt"}</small><b>{q.validUntil?date(q.validUntil):dateTime(q.sentAt||q.createdAt)}</b></span>
          {q.plannedStartDate&&<span><small>Tidligst oppstart</small><b>{date(q.plannedStartDate)}</b></span>}
         </div>
         <Link className="btn" href={q.href}>Åpne og svar på tilbud</Link>
        </div>
       </details>
      })}
     </div>
    </div>}
    {pastQuotes.length>0&&<div className="customerCompactGroup customerCompactHistory">
     <div className="customerCompactGroupHead"><h3>Historikk</h3><span>{pastQuotes.length}</span></div>
     <div className="customerCompactList">
      {pastQuotes.map(q=>{
       const status=effectiveQuoteStatus(q);
       return <details className="customerCompactRow" key={q.id}>
        <summary>
         <span className="customerCompactDate"><b>{dateTime(q.acceptedAt||q.declinedAt||q.sentAt||q.createdAt)}</b><small>Sist endret</small></span>
         <span className="customerCompactMain"><b>{q.title}</b><small>{q.quoteNumber}{q.revisionNumber>1?" · Revisjon "+q.revisionNumber:""}</small></span>
         <span className={"customerStatus customerStatus-"+status}>{quoteStatus[status]||status}</span>
         <span className="customerCompactMeta">{kr(q.totalIncVatOre)}</span>
         <span className="customerCompactChevron">⌄</span>
        </summary>
        <div className="customerCompactDetails">
         <div className="customerCardMeta">
          <span><small>Total inkl. MVA</small><b>{kr(q.totalIncVatOre)}</b></span>
          {q.validUntil&&<span><small>Gyldig til</small><b>{date(q.validUntil)}</b></span>}
          {q.plannedStartDate&&<span><small>Tidligst oppstart</small><b>{date(q.plannedStartDate)}</b></span>}
         </div>
         {status==="accepted"&&<p className="customerQuoteMessage">{q.acceptanceMethod==="paper"?"Tilbudet er godkjent på papir"+(q.paperSignedDate?" · signert "+date(q.paperSignedDate):"")+".":"Tilbudet er godkjent."}</p>}
         {status==="declined"&&<p className="customerQuoteMessage">Tilbudet er avslått.</p>}
         {status==="expired"&&<p className="customerQuoteMessage">Tilbudets gyldighetsdato er passert.</p>}
         {status==="superseded"&&<p className="customerQuoteMessage">Denne versjonen er erstattet av en nyere revisjon.</p>}
         <Link className="btn alt" href={q.href}>Åpne tilbud</Link>
        </div>
       </details>
      })}
     </div>
    </div>}
   </>}
  </section>}

  {activePanel==="oppdrag"&&<section id="oppdrag" className="customerDashboardSection customerJobsSection customerPortalPanel">
   <div className="customerSectionHead">
    <div><div className="kicker">MINE OPPDRAG</div><h2>Oppdrag</h2></div>
    <span>{jobs.length}</span>
   </div>
   {!jobs.length?<div className="card customerEmpty"><p>Ingen aktive eller tidligere oppdrag knyttet til kontoen ennå.</p></div>:<>
    {activeJobRows.length>0&&<div className="customerCompactGroup">
     <div className="customerCompactGroupHead"><h3>Aktive oppdrag</h3><span>{activeJobRows.length}</span></div>
     <div className="customerCompactList">
      {activeJobRows.map(o=>{
       const q=o.source_quote;
       return <details className="customerCompactRow" key={o.id}>
        <summary>
         <span className="customerCompactDate"><b>{o.job_start_at?dateTime(o.job_start_at):"Ikke avtalt"}</b><small>Oppstart</small></span>
         <span className="customerCompactMain"><b>{q?.title||"Oppdrag"}</b><small>{o.order_number}{q?.quoteNumber?" · "+q.quoteNumber:""}</small></span>
         <span className={"customerStatus customerStatus-"+o.status}>{orderStatus[o.status]||o.status}</span>
         <span className="customerCompactMeta">{kr(q?.totalIncVatOre||o.total_ore)}</span>
         <span className="customerCompactChevron">⌄</span>
        </summary>
        <div className="customerCompactDetails">
         {o.job_start_at?<div className="customerJobStart">
          <small>AVTALT OPPSTART</small><b>{dateTimeFull(o.job_start_at)}</b>
          {o.job_confirmation_sent_at&&<span>Bekreftet på e-post {dateTime(o.job_confirmation_sent_at)}</span>}
          {o.job_reminder_sent_at&&<span>Påminnelse sendt {dateTime(o.job_reminder_sent_at)}</span>}
         </div>:q?.earliestStartDate?<div className="customerJobStart customerJobStartPending">
          <small>TIDLIGST OPPSTART I TILBUDET</small><b>{date(q.earliestStartDate)}</b><span>Endelig oppstart er ikke avtalt ennå.</span>
         </div>:<div className="customerJobStart customerJobStartPending"><small>OPPSTART</small><b>Ikke avtalt ennå</b><span>Vi tar kontakt når oppstart skal avtales.</span></div>}
         {o.job_customer_agreement&&<div className="customerJobAgreement"><small>DETTE ER AVTALT VIDERE</small><p>{o.job_customer_agreement}</p>{o.job_planning_updated_at&&<span>Sist oppdatert {dateTimeFull(o.job_planning_updated_at)}</span>}</div>}
         <div className="customerCardMeta">
          <span><small>Avtalt total</small><b>{kr(q?.totalIncVatOre||o.total_ore)}</b></span>
          <span><small>Betaling</small><b>{paymentStatus[o.payment_status]||o.payment_status||"Ikke registrert"}</b></span>
         </div>
         {Array.isArray(q?.paymentPlan)&&q.paymentPlan.length>0&&<div className="customerJobPaymentPlan">
          <h4>Betalingsplan</h4>
          {q.paymentPlan.map((row,index)=><div key={row.id||index}><span><b>{row.label||("Delbetaling "+(index+1))}</b><small>{row.trigger||""}</small></span><strong>{row.percent}% · {kr((q.totalIncVatOre||o.total_ore)*(Number(row.percent)||0)/100)}</strong></div>)}
         </div>}
         {q?.href&&<Link className="btn alt" href={q.href}>Åpne godkjent tilbud</Link>}
        </div>
       </details>
      })}
     </div>
    </div>}
    {pastJobRows.length>0&&<div className="customerCompactGroup customerCompactHistory">
     <div className="customerCompactGroupHead"><h3>Historikk</h3><span>{pastJobRows.length}</span></div>
     <div className="customerCompactList">
      {pastJobRows.map(o=>{
       const q=o.source_quote;
       return <details className="customerCompactRow" key={o.id}>
        <summary>
         <span className="customerCompactDate"><b>{dateTime(o.created_at)}</b><small>Opprettet</small></span>
         <span className="customerCompactMain"><b>{q?.title||"Oppdrag"}</b><small>{o.order_number}</small></span>
         <span className={"customerStatus customerStatus-"+o.status}>{orderStatus[o.status]||o.status}</span>
         <span className="customerCompactMeta">{kr(q?.totalIncVatOre||o.total_ore)}</span>
         <span className="customerCompactChevron">⌄</span>
        </summary>
        <div className="customerCompactDetails">
         <div className="customerCardMeta">
          <span><small>Avtalt total</small><b>{kr(q?.totalIncVatOre||o.total_ore)}</b></span>
          <span><small>Betaling</small><b>{paymentStatus[o.payment_status]||o.payment_status||"Ikke registrert"}</b></span>
         </div>
         {q?.href&&<Link className="btn alt" href={q.href}>Åpne tilbud</Link>}
        </div>
       </details>
      })}
     </div>
    </div>}
   </>}
  </section>}

  {activePanel==="tegninger"&&<section id="tegninger" className="customerDashboardSection customerPortalPanel customerDrawingsPanel">
   <div className="customerSectionHead">
    <div><div className="kicker">TEGNINGER</div><h2>Mine tegninger</h2><p>Her ser du tegninger Aadland Service har delt med deg. Du kan veksle mellom plantegning og 3D, og dra 3D-visningen rundt for å se løsningen fra flere vinkler.</p></div>
    <span>{drawings.length}</span>
   </div>
   {!drawings.length?<div className="card customerEmpty"><p>Ingen tegninger er delt med kontoen din ennå.</p></div>:<div className="customerDrawingList">
    {drawings.map(drawing=><article className="card customerDrawingCard" key={drawing.id}>
     <header><div><small>TEGNING</small><h3>{drawing.name||"Tegning"}</h3>{drawing.address&&<p>{drawing.address}</p>}</div><span>Sist oppdatert {dateTime(drawing.updatedAt)}</span></header>
     {drawing.notes&&<p className="customerDrawingNote">{drawing.notes}</p>}
     <CustomerDrawingViewer drawing={drawing}/>
    </article>)}
   </div>}
  </section>}

  {activePanel==="bestillinger"&&<section id="bestillinger" className="customerDashboardSection customerPortalPanel">
   <div className="customerSectionHead"><div><div className="kicker">HANDEL</div><h2>Bestillinger</h2></div><div className="customerSectionActions"><span>{purchases.length}</span><a className="btn alt" href={rentalContext?"https://www.aadland-service.no/produkter":"/produkter"}>Se produkter</a></div></div>
   {!purchases.length?<div className="card customerEmpty"><p>Ingen produktbestillinger knyttet til kontoen ennå.</p></div>:<>
    {activePurchaseRows.length>0&&<div className="customerCompactGroup">
     <div className="customerCompactGroupHead"><h3>Aktive bestillinger</h3><span>{activePurchaseRows.length}</span></div>
     <div className="customerCompactList">
      {activePurchaseRows.map(o=><details className="customerCompactRow" key={o.id}>
       <summary>
        <span className="customerCompactDate"><b>{dateTime(o.created_at)}</b><small>Bestilt</small></span>
        <span className="customerCompactMain"><b>{(Array.isArray(o.items)&&o.items[0]?.name)||"Bestilling"}{Array.isArray(o.items)&&o.items.length>1?" + "+(o.items.length-1)+" til":""}</b><small>{o.order_number}</small></span>
        <span className={"customerStatus customerStatus-"+o.status}>{orderStatus[o.status]||o.status}</span>
        <span className="customerCompactMeta">{kr(o.total_ore)}</span>
        <span className="customerCompactChevron">⌄</span>
       </summary>
       <div className="customerCompactDetails">
        {Array.isArray(o.items)&&o.items.length>0&&<div className="customerItemList">
         {o.items.slice(0,6).map((item,index)=><div key={(item.productId||item.name||"item")+"-"+index}><span><b>{item.name||"Produkt"}</b><small>Antall {item.quantity||1}</small></span><span className="customerItemRepeat"><strong>{kr((Number(item.unitPriceOre)||0)*(Number(item.quantity)||1))}</strong>{item.productSlug&&<button type="button" className="btn alt" onClick={()=>repeatPurchase(item)}>Kjøp igjen</button>}</span></div>)}
         {o.items.length>6&&<small>+ {o.items.length-6} flere varelinjer</small>}
        </div>}
        <div className="customerCardMeta">
         <span><small>Sum</small><b>{kr(o.total_ore)}</b></span>
         <span><small>Betaling</small><b>{paymentStatus[o.payment_status]||o.payment_status||"Ikke registrert"}</b></span>
         {String(o.payment_provider||"").toLowerCase()==="vipps"&&Number(o.payment_reserved_ore)>0&&<span><small>Reservert i Vipps</small><b>{kr(o.payment_reserved_ore)}</b></span>}
         {Number(o.payment_captured_ore)>0&&<span><small>Registrert betalt</small><b>{kr(o.payment_captured_ore)}</b></span>}
         {String(o.payment_provider||"").toLowerCase()==="vipps"&&o.payment_capture_guaranteed_until&&<span><small>Reservasjon gyldig til</small><b>{dateTimeFull(o.payment_capture_guaranteed_until)}</b></span>}
         <span><small>Levering</small><b>{fulfillmentStatus[o.fulfillment_type]||o.fulfillment_type||"Ikke registrert"}</b></span>
         {Number(o.shipping_ore)>0&&<span><small>Frakt</small><b>{kr(o.shipping_ore)}</b></span>}
        </div>
        {String(o.payment_provider||"").toLowerCase()==="vipps"&&o.payment_status==="authorized"&&<div className="customerPaymentConfirmation">
         <b>✓ Vipps-beløpet er reservert</b>
         <span>Beløpet trekkes først når varen eller tjenesten kan leveres.</span>
        </div>}
        {serviceVippsAvailable&&String(o.payment_provider||"").toLowerCase()==="vipps"&&o.payment_status==="pending"&&o.status!=="cancelled"&&<div className="customerPaymentConfirmation">
         <b>Vipps-betalingen er startet</b>
         <span>Hvis betalingsvinduet ble lukket, kan du fortsette samme betaling.</span>
         <button type="button" className="btn" disabled={paymentBusyId===o.id} onClick={()=>resumeOrderVipps(o)}>{paymentBusyId===o.id?"Åpner Vipps …":"Fortsett Vipps-betaling"}</button>
        </div>}
        {o.fulfillment_type==="delivery"&&<div className="customerPaymentConfirmation"><b>{o.delivery_within_radius===true?"✓ Leveringsområdet er godkjent":o.delivery_within_radius===false?"Leveringsadressen er utenfor 15 km":"Leveringsområdet kontrolleres"}</b><span>{o.delivery_within_radius===true?"Adressen er godkjent for lokal levering innen 15 km.":o.delivery_within_radius===false?"Vi tar kontakt for å avtale henting eller en annen løsning.":"Vi kontrollerer adressen før bestillingen bekreftes."}</span></div>}
        {o.confirmation_sent_at&&<div className="customerPaymentConfirmation"><b>✓ Ordrebekreftelse sendt</b><span>Sendt {dateTimeFull(o.confirmation_sent_at)}</span></div>}
        {(o.confirmed_at||o.in_progress_at)&&<div className="customerPaymentConfirmation"><b>Ordrefremdrift</b>{o.confirmed_at&&<span>✓ Bekreftet {dateTimeFull(o.confirmed_at)}</span>}{o.in_progress_at&&<span>✓ Under arbeid {dateTimeFull(o.in_progress_at)}</span>}</div>}
        {o.status==="ready"&&["pickup","delivery"].includes(o.fulfillment_type)&&<div className="customerPaymentConfirmation"><b>{o.fulfillment_type==="pickup"?"✓ Klar for henting":"✓ Klar for levering"}</b>{o.ready_notice_sent_at&&<span>Varsel sendt {dateTimeFull(o.ready_notice_sent_at)}</span>}</div>}
        {o.fulfillment_type==="shipping"&&(o.tracking_number||o.tracking_url)&&<div className="customerPaymentConfirmation"><b>✓ Bestillingen er sendt</b>{o.tracking_number&&<span>Sporingsnummer: {o.tracking_number}</span>}{o.tracking_url&&<a className="btn alt" href={o.tracking_url} target="_blank" rel="noopener noreferrer">Spor pakken</a>}</div>}
        {o.payment_status==="paid"&&(o.payment_reference||o.receipt_sent_at)&&<div className="customerPaymentConfirmation"><b>✓ Betaling registrert</b>{o.payment_reference&&<span>Referanse: {o.payment_reference}</span>}{o.receipt_sent_at&&<span>Betalingsbekreftelse sendt {dateTimeFull(o.receipt_sent_at)}</span>}</div>}
       </div>
      </details>)}
     </div>
    </div>}
    {pastPurchaseRows.length>0&&<div className="customerCompactGroup customerCompactHistory">
     <div className="customerCompactGroupHead"><h3>Historikk</h3><span>{pastPurchaseRows.length}</span></div>
     <div className="customerCompactList">
      {pastPurchaseRows.map(o=><details className="customerCompactRow" key={o.id}>
       <summary>
        <span className="customerCompactDate"><b>{dateTime(o.created_at)}</b><small>Bestilt</small></span>
        <span className="customerCompactMain"><b>{(Array.isArray(o.items)&&o.items[0]?.name)||"Bestilling"}{Array.isArray(o.items)&&o.items.length>1?" + "+(o.items.length-1)+" til":""}</b><small>{o.order_number}</small></span>
        <span className={"customerStatus customerStatus-"+o.status}>{orderStatus[o.status]||o.status}</span>
        <span className="customerCompactMeta">{kr(o.total_ore)}</span>
        <span className="customerCompactChevron">⌄</span>
       </summary>
       <div className="customerCompactDetails">
        {Array.isArray(o.items)&&o.items.length>0&&<div className="customerItemList">
         {o.items.slice(0,6).map((item,index)=><div key={(item.productId||item.name||"item")+"-"+index}><span><b>{item.name||"Produkt"}</b><small>Antall {item.quantity||1}</small></span><span className="customerItemRepeat"><strong>{kr((Number(item.unitPriceOre)||0)*(Number(item.quantity)||1))}</strong>{item.productSlug&&<button type="button" className="btn alt" onClick={()=>repeatPurchase(item)}>Kjøp igjen</button>}</span></div>)}
        </div>}
        <div className="customerCardMeta">
         <span><small>Sum</small><b>{kr(o.total_ore)}</b></span>
         <span><small>Betaling</small><b>{paymentStatus[o.payment_status]||o.payment_status||"Ikke registrert"}</b></span>
         <span><small>Levering</small><b>{fulfillmentStatus[o.fulfillment_type]||o.fulfillment_type||"Ikke registrert"}</b></span>
        </div>
        {o.status==="cancelled"&&<div className="customerPaymentConfirmation"><b>Bestillingen er kansellert</b>{o.cancellation_reason&&<span>Årsak: {o.cancellation_reason}</span>}{o.cancelled_at&&<span>Kansellert {dateTimeFull(o.cancelled_at)}</span>}</div>}
        {o.delivered_at&&<div className="customerPaymentConfirmation"><b>✓ Bestillingen er levert</b><span>Registrert levert {dateTimeFull(o.delivered_at)}</span></div>}
        {Number(o.payment_refunded_ore)>0&&<div className="customerPaymentConfirmation"><b>{Number(o.payment_refunded_ore)>=Number(o.payment_captured_ore||0)?"✓ Betalingen er tilbakebetalt":"✓ Delvis tilbakebetaling registrert"}</b><span>Totalt tilbakebetalt: {kr(o.payment_refunded_ore)}</span></div>}
       </div>
      </details>)}
     </div>
    </div>}
   </>}
  </section>}

  {activePanel==="utleie"&&<section id="utleie" className="customerDashboardSection customerPortalPanel">
   <div className="customerSectionHead">
    <div><div className="kicker">UTLEIE</div><h2>Utleie</h2></div>
    <div className="customerSectionActions"><span>{rentals.length}</span><Link className="btn alt" href="/utleie">Ny utleie</Link></div>
   </div>

   {!rentals.length?<div className="card customerEmpty"><p>Ingen utleier knyttet til kontoen ennå.</p></div>:<>
    {upcomingRentals.length>0&&<div className="customerRentalGroup">
     <div className="customerRentalGroupHead"><h3>Aktive og kommende</h3><span>{upcomingRentals.length}</span></div>
     <div className="customerRentalList">
      {upcomingRentals.map(r=><details className="customerRentalRow" key={r.id}>
       <summary>
        <span className="customerRentalDate">
         <b>{date(r.start_date)}</b>
         <small>{date(r.end_date)!==date(r.start_date)?"til "+date(r.end_date):"Én dag"}</small>
        </span>
        <span className="customerRentalMain">
         <b>{r.rental_items?.name||"Utleie"}</b>
         <small>{r.booking_number}</small>
        </span>
        <span className={"customerStatus customerStatus-"+r.status}>{rentalDisplayStatus(r)}</span>
        <span className="customerRentalPrice">{kr(r.total_ore)}</span>
        <span className="customerRentalChevron" aria-hidden="true">⌄</span>
       </summary>
       <div className="customerRentalDetails">
        <div className="customerCardMeta">
         <span><small>Periode</small><b>{date(r.start_date)} – {date(r.end_date)}</b></span>
         <span><small>Leiepris</small><b>{kr(r.total_ore)}</b></span>
         <span><small>Betaling</small><b>{paymentStatus[r.payment_status]||r.payment_status||"Ikke registrert"}</b></span>
         {String(r.payment_provider||"").toLowerCase()==="vipps"&&Number(r.payment_reserved_ore)>0&&<span><small>Reservert i Vipps</small><b>{kr(r.payment_reserved_ore)}</b></span>}
         {Number(r.payment_captured_ore)>0&&<span><small>Registrert betalt</small><b>{kr(r.payment_captured_ore)}</b></span>}
         {String(r.payment_provider||"").toLowerCase()==="vipps"&&r.payment_capture_guaranteed_until&&<span><small>Reservasjon gyldig til</small><b>{dateTimeFull(r.payment_capture_guaranteed_until)}</b></span>}
         <span><small>Utlevering</small><b>{fulfillmentStatus[r.customer?.fulfillment]||"Ikke registrert"}</b></span>
         {Number(r.deposit_ore)>0&&<span><small>Depositum</small><b>{kr(r.deposit_ore)} · {depositStatus[r.deposit_status]||r.deposit_status||"Ikke registrert"}</b></span>}
        </div>
        {String(r.payment_provider||"").toLowerCase()==="vipps"&&r.payment_status==="authorized"&&<div className="customerPaymentConfirmation">
         <b>✓ Vipps-beløpet er reservert</b>
         <span>Beløpet trekkes først når leien kan leveres eller utleveres.</span>
        </div>}
        {rentalVippsAvailable&&!["authorized","paid","refunded"].includes(String(r.payment_status||"unpaid").toLowerCase())&&r.status!=="cancelled"&&<div className="customerPaymentConfirmation">
         <b>Leiebetalingen er ikke ferdig</b>
         <span>Du kan betale leiebeløpet med Vipps. Eventuelt depositum håndteres separat.</span>
         <button type="button" className="btn" disabled={paymentBusyId===r.id} onClick={()=>startRentalVipps(r)}>{paymentBusyId===r.id?"Åpner Vipps …":"Betal leien med Vipps"}</button>
        </div>}
        {(r.confirmation_sent_at||r.reminder_sent_at||r.cancellation_sent_at)&&<div className="customerPaymentConfirmation">
         <b>Varsler</b>
         {r.confirmation_sent_at&&<span>✓ Bookingbekreftelse sendt {dateTimeFull(r.confirmation_sent_at)}</span>}
         {r.reminder_sent_at&&<span>✓ Påminnelse sendt {dateTimeFull(r.reminder_sent_at)}</span>}
         {r.cancellation_sent_at&&<span>✓ Avbestillingsbekreftelse sendt {dateTimeFull(r.cancellation_sent_at)}</span>}
        </div>}
        {r.status==="active"&&<div className="customerPaymentConfirmation"><b>Utstyret er utlevert</b><span>Bookingen er registrert som aktiv.</span></div>}
        {["paid","refunded"].includes(r.payment_status)&&r.receipt_sent_at&&<div className="customerPaymentConfirmation"><b>✓ Leiebetaling registrert</b><span>Betalingsbekreftelse sendt {dateTimeFull(r.receipt_sent_at)}</span></div>}
        {Number(r.deposit_ore)>0&&["held","released","partially_charged","charged"].includes(r.deposit_status)&&<div className="customerPaymentConfirmation">
         <b>{r.deposit_status==="released"?"✓ Depositum frigitt":r.deposit_status==="held"?"✓ Depositum mottatt":"Depositum oppgjort"}</b>
         {Number(r.deposit_held_ore)>0&&<span>Registrert holdt: {kr(r.deposit_held_ore)}</span>}
         {Number(r.deposit_charged_ore)>0&&<span>Registrert brukt: {kr(r.deposit_charged_ore)}</span>}
         {r.deposit_released_at&&<span>Frigitt {dateTimeFull(r.deposit_released_at)}</span>}
        </div>}
        {r.rental_items?.slug&&<button type="button" className="btn alt" onClick={()=>repeatRental(r)}>Lei igjen</button>}
       </div>
      </details>)}
     </div>
    </div>}

    {pastRentals.length>0&&<div className="customerRentalGroup customerRentalPast">
     <div className="customerRentalGroupHead"><h3>Tidligere utleie</h3><span>{pastRentals.length}</span></div>
     <div className="customerRentalList">
      {pastRentals.map(r=><details className="customerRentalRow" key={r.id}>
       <summary>
        <span className="customerRentalDate">
         <b>{date(r.start_date)}</b>
         <small>{date(r.end_date)!==date(r.start_date)?"til "+date(r.end_date):"Én dag"}</small>
        </span>
        <span className="customerRentalMain">
         <b>{r.rental_items?.name||"Utleie"}</b>
         <small>{r.booking_number}</small>
        </span>
        <span className={"customerStatus customerStatus-"+r.status}>{rentalDisplayStatus(r)}</span>
        <span className="customerRentalPrice">{kr(r.total_ore)}</span>
        <span className="customerRentalChevron" aria-hidden="true">⌄</span>
       </summary>
       <div className="customerRentalDetails">
        <div className="customerCardMeta">
         <span><small>Periode</small><b>{date(r.start_date)} – {date(r.end_date)}</b></span>
         <span><small>Leiepris</small><b>{kr(r.total_ore)}</b></span>
         <span><small>Betaling</small><b>{paymentStatus[r.payment_status]||r.payment_status||"Ikke registrert"}</b></span>
         <span><small>Utlevering</small><b>{fulfillmentStatus[r.customer?.fulfillment]||"Ikke registrert"}</b></span>
         {Number(r.deposit_ore)>0&&<span><small>Depositum</small><b>{kr(r.deposit_ore)} · {depositStatus[r.deposit_status]||r.deposit_status||"Ikke registrert"}</b></span>}
        </div>
        {r.status==="returned"&&<div className="customerPaymentConfirmation"><b>✓ Utstyret er returnert</b><span>{r.payment_status==="paid"?"Leiebetalingen er registrert.":"Oppgjøret er ikke ferdig registrert ennå."}</span></div>}
        {r.status==="completed"&&<div className="customerPaymentConfirmation"><b>✓ Utleien er ferdigbehandlet</b><span>Betaling og eventuelt depositum er avklart.</span></div>}
        {r.status==="cancelled"&&<div className="customerPaymentConfirmation"><b>Bookingen er avbrutt</b><span>Ta kontakt dersom noe rundt betaling eller depositum ikke stemmer.</span></div>}
        {Number(r.payment_refunded_ore)>0&&<div className="customerPaymentConfirmation">
         <b>{Number(r.payment_refunded_ore)>=Number(r.payment_captured_ore||0)?"✓ Leiebetalingen er tilbakebetalt":"✓ Delvis tilbakebetaling registrert"}</b>
         <span>Totalt tilbakebetalt: {kr(r.payment_refunded_ore)}</span>
         {r.refund_notice_sent_at&&<span>Bekreftelse sendt {dateTimeFull(r.refund_notice_sent_at)}</span>}
        </div>}
        {r.rental_items?.slug&&<button type="button" className="btn alt" onClick={()=>repeatRental(r)}>Lei igjen</button>}
       </div>
      </details>)}
     </div>
    </div>}
   </>}
  </section>}
   </div>
  </div>
 </main>;
}
