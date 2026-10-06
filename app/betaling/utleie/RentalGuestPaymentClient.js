"use client";

import {useEffect,useState} from "react";

const paymentLabels={
 unpaid:"Ikke betalt",
 pending:"Avventer betaling",
 authorized:"Reservert i Vipps",
 partial:"Delvis betalt",
 paid:"Betalt",
 refunded:"Tilbakebetalt",
 cancelled:"Avbrutt"
};

const bookingLabels={
 new:"Mottatt",
 confirmed:"Bekreftet",
 active:"Pågående",
 returned:"Returnert",
 completed:"Fullført",
 cancelled:"Avbrutt"
};

const kr=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format((Number(ore)||0)/100);
const date=value=>value?new Intl.DateTimeFormat("nb-NO").format(new Date(value+"T12:00:00")):"";

export default function RentalGuestPaymentClient({bookingId}){
 const [token,setToken]=useState("");
 const [booking,setBooking]=useState(null);
 const [expiresAt,setExpiresAt]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");

 async function status(activeToken){
  const response=await fetch("/api/rental-payment-link",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({action:"status",bookingId,token:activeToken})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Betalingslenken kunne ikke åpnes.");
  setBooking(result.booking||null);
  setExpiresAt(result.expiresAt||"");
 }

 useEffect(()=>{
  let active=true;
  (async()=>{
   try{
    const hash=new URLSearchParams(String(window.location.hash||"").replace(/^#/,""));
    const hashToken=hash.get("token")||"";
    const key="aadlandRentalPaymentToken:"+bookingId;
    const activeToken=hashToken||sessionStorage.getItem(key)||"";
    if(hashToken){
     sessionStorage.setItem(key,hashToken);
     window.history.replaceState({},document.title,"/betaling/utleie?booking="+encodeURIComponent(bookingId));
    }
    if(!bookingId||!activeToken)throw new Error("Betalingslenken mangler eller er ugyldig.");
    if(!active)return;
    setToken(activeToken);
    await status(activeToken);
   }catch(err){
    if(active)setError(err.message||"Betalingslenken kunne ikke åpnes.");
   }finally{
    if(active)setLoading(false);
   }
  })();
  return()=>{active=false};
 },[bookingId]);

 async function startPayment(){
  if(!token||!bookingId)return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/rental-payment-link",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"start",bookingId,token})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok){
    setError(result.error||"Vipps-betalingen kunne ikke startes.");
    try{await status(token)}catch{}
    return;
   }
   if(!result.redirectUrl)throw new Error("Vipps svarte uten betalingslenke.");
   window.location.assign(result.redirectUrl);
  }catch(err){
   setError(err.message||"Vipps-betalingen kunne ikke startes akkurat nå.");
  }finally{
   setBusy(false);
  }
 }

 return <main className="customerPage customerLoginPage">
  <a href="/utleie">← Aadland Utleie</a>
  <div className="kicker customerTopKicker">SIKKER BETALING</div>
  <h1>Betal utleien med Vipps</h1>

  {loading&&<div className="card"><p>Laster booking …</p></div>}
  {error&&<p className="notice">{error}</p>}

  {!loading&&booking&&<div className="card customerAccountCard">
   <div className="customerAccountFacts">
    <span><small>Booking</small><b>{booking.bookingNumber}</b></span>
    <span><small>Utstyr</small><b>{booking.itemName}</b></span>
    <span><small>Periode</small><b>{date(booking.startDate)} – {date(booking.endDate)}</b></span>
    <span><small>Status</small><b>{bookingLabels[booking.bookingStatus]||booking.bookingStatus}</b></span>
    <span><small>Leiebeløp</small><b>{kr(booking.totalOre)}</b></span>
    <span><small>Betaling</small><b>{paymentLabels[booking.paymentStatus]||booking.paymentStatus}</b></span>
    {Number(booking.depositOre)>0&&<span><small>Depositum</small><b>{kr(booking.depositOre)} · håndteres separat</b></span>}
   </div>

   {booking.paymentStatus==="authorized"&&<div className="success">
    Vipps-beløpet er reservert. Det trekkes først når utleien kan leveres eller utleveres.
   </div>}

   {["paid","refunded"].includes(booking.paymentStatus)&&<div className="success">
    {booking.paymentStatus==="paid"?"Leiebetalingen er registrert.":"Leiebetalingen er tilbakebetalt."}
   </div>}

   {booking.bookingStatus==="cancelled"&&<div className="notice">Bookingen er avbrutt og kan ikke betales.</div>}

   {booking.canPay&&<div className="customerAccountActions">
    <button type="button" className="btn" disabled={busy} onClick={startPayment}>{busy?"Åpner Vipps …":booking.paymentStatus==="pending"?"Fortsett Vipps-betaling":"Betal med Vipps · "+kr(booking.totalOre)}</button>
   </div>}

   {!booking.vippsAvailable&&!["authorized","paid","refunded"].includes(booking.paymentStatus)&&<p className="muted">Vipps-betaling er midlertidig utilgjengelig. Prøv igjen senere.</p>}
   {booking.bookingStatus==="new"&&<p className="muted">Betaling blir tilgjengelig når bookingen er bekreftet.</p>}
   {expiresAt&&<p className="muted"><small>Den sikre betalingslenken er gyldig til {new Date(expiresAt).toLocaleString("nb-NO")}.</small></p>}
   <p className="muted">Vipps gjelder bare leiebeløpet. Eventuelt depositum håndteres separat. <a href="/vilkar/utleie" target="_blank" rel="noreferrer">Se utleiebetingelsene</a>.</p>
  </div>}
 </main>;
}
