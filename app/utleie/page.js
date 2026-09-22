"use client";

import {useEffect,useState} from "react";
import {CatalogFooter,CatalogHeader,CatalogPlaceholder} from "../produkter/ProductChrome";

const localToday=()=>{
 const d=new Date();
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return `${v.year}-${v.month}-${v.day}`;
};
const kr=o=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format((Number(o)||0)/100);
const monthLabel=month=>new Date(month+"-01T12:00:00Z").toLocaleDateString("nb-NO",{month:"long",year:"numeric",timeZone:"UTC"});
const shiftMonth=(month,amount)=>{
 const [year,number]=month.split("-").map(Number);
 const d=new Date(Date.UTC(year,number-1+amount,1,12));
 return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0");
};
const calendarDays=month=>{
 const [year,number]=month.split("-").map(Number);
 const days=new Date(Date.UTC(year,number,0,12)).getUTCDate();
 const offset=(new Date(Date.UTC(year,number-1,1,12)).getUTCDay()+6)%7;
 return [...Array(offset).fill(null),...Array.from({length:days},(_,i)=>month+"-"+String(i+1).padStart(2,"0"))];
};
const displayDate=value=>value?new Date(value+"T12:00:00Z").toLocaleDateString("nb-NO",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}):"";

function RentalProductCalendar({item,onBook,refreshKey}){
 const today=localToday();
 const currentMonth=today.slice(0,7);
 const [month,setMonth]=useState(currentMonth);
 const [unavailable,setUnavailable]=useState([]);
 const [loading,setLoading]=useState(true);
 const [start,setStart]=useState("");
 const [end,setEnd]=useState("");
 const [quote,setQuote]=useState(null);
 const [error,setError]=useState("");
 const [quoting,setQuoting]=useState(false);
 const cells=calendarDays(month);
 const blocked=new Set(unavailable);

 useEffect(()=>{
  let cancelled=false;
  setLoading(true);
  fetch("/api/rental/calendar?itemId="+encodeURIComponent(item.id)+"&month="+month)
   .then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Kalenderen kunne ikke lastes.");
    return data;
   })
   .then(data=>{if(!cancelled)setUnavailable(Array.isArray(data.unavailableDates)?data.unavailableDates:[])})
   .catch(err=>{if(!cancelled){setUnavailable([]);setError(err.message||"Kalenderen kunne ikke lastes.")}})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[item.id,month,refreshKey]);

 useEffect(()=>{
  setStart("");
  setEnd("");
  setQuote(null);
  setError("");
 },[refreshKey]);

 function disabled(date){
  return date<today||blocked.has(date)||item.status!=="available";
 }

 async function chooseDate(date){
  if(disabled(date))return;
  setError("");

  if(!start||end){
   setStart(date);
   setEnd("");
   setQuote(null);
   return;
  }

  if(date<start){
   setStart(date);
   setEnd("");
   setQuote(null);
   return;
  }

  setEnd(date);
  setQuote(null);
  setQuoting(true);
  try{
   const response=await fetch("/api/rental?itemId="+encodeURIComponent(item.id)+"&start="+start+"&end="+date);
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Perioden kunne ikke kontrolleres.");
   const result=(data.items||[]).find(entry=>entry.id===item.id);
   if(!result||!result.available){
    setEnd("");
    throw new Error("Perioden inneholder opptatte eller sperrede dager. Velg en annen periode.");
   }
   setQuote(result.pricing||null);
  }catch(err){
   setQuote(null);
   setError(err.message||"Perioden kunne ikke kontrolleres.");
  }finally{
   setQuoting(false);
  }
 }

 function selected(date){
  if(!start)return false;
  if(!end)return date===start;
  return date>=start&&date<=end;
 }

 function startBooking(){
  if(!start||!end||!quote)return;
  onBook(item,start,end,quote);
 }

 return <div className="rentalProductCalendar">
  <div className="rentalCalendarTitle">
   <div>
    <span className="catalogEyebrow">VELG DATO</span>
    <h4>{monthLabel(month)}</h4>
   </div>
   <div className="rentalMonthNav">
    <button type="button" disabled={month<=currentMonth} aria-label="Forrige måned" onClick={()=>setMonth(current=>shiftMonth(current,-1))}>←</button>
    <button type="button" aria-label="Neste måned" onClick={()=>setMonth(current=>shiftMonth(current,1))}>→</button>
   </div>
  </div>

  <p className="rentalCalendarHelp">{start&&!end?"Velg siste leiedag.":"Trykk første og siste dagen du ønsker å leie."}</p>

  <div className="rentalCalendarWeekdays" aria-hidden="true">
   {["Man","Tir","Ons","Tor","Fre","Lør","Søn"].map(day=><span key={day}>{day}</span>)}
  </div>

  <div className={"rentalCustomerCalendar "+(loading?"isLoading":"")} aria-busy={loading}>
   {cells.map((date,index)=>date?(
    <button
     type="button"
     key={date}
     className={[
      "rentalCalendarDay",
      disabled(date)?"isUnavailable":"",
      selected(date)?"isSelected":"",
      date===start?"isStart":"",
      date===end?"isEnd":""
     ].filter(Boolean).join(" ")}
     disabled={disabled(date)}
     aria-label={displayDate(date)+(disabled(date)?" – ikke tilgjengelig":selected(date)?" – valgt":" – ledig")}
     aria-pressed={selected(date)}
     onClick={()=>chooseDate(date)}
    >
     {Number(date.slice(-2))}
    </button>
   ):<span className="rentalCalendarBlank" key={"blank-"+index}/>)}
  </div>

  <div className="rentalCalendarLegend">
   <span><i className="isFree"></i>Ledig</span>
   <span><i className="isBusy"></i>Opptatt</span>
   <span><i className="isChosen"></i>Valgt</span>
  </div>

  {error&&<p className="rentalCalendarError">{error}</p>}

  {(start||quote)&&<div className="rentalSelectionSummary">
   <div>
    <small>Valgt periode</small>
    <b>{start}{end?" – "+end:" – velg sluttdato"}</b>
   </div>
   {quoting?<span>Sjekker pris …</span>:quote&&<>
    <div><small>Leiepris</small><b>{kr(quote.totalOre)}</b></div>
    {Number(item.depositOre)>0&&<div><small>Depositum</small><b>{kr(item.depositOre)}</b></div>}
   </>}
  </div>}

  {quote&&start&&end&&<button type="button" className="catalogGoldButton rentalCalendarBookButton" onClick={startBooking}>
   Fortsett til booking →
  </button>}
 </div>;
}

export default function Utleie(){
 const [items,setItems]=useState([]);
 const [loading,setLoading]=useState(false);
 const [chosen,setChosen]=useState(null);
 const [customer,setCustomer]=useState({name:"",email:"",phone:"",address:""});
 const [accepted,setAccepted]=useState(false);
 const [fulfillment,setFulfillment]=useState("pickup");
 const [msg,setMsg]=useState("");
 const [err,setErr]=useState("");
 const [setup,setSetup]=useState(false);
 const [booking,setBooking]=useState(false);
 const [refreshKey,setRefreshKey]=useState(0);

 async function load(){
  setLoading(true);
  setErr("");
  try{
   const r=await fetch("/api/rental");
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error||"Utleie kunne ikke lastes.");
   setItems(d.items||[]);
   setSetup(!!d.setupRequired);
  }catch(e){
   setErr(e.message||"Utleie kunne ikke lastes.");
  }finally{
   setLoading(false);
  }
 }

 useEffect(()=>{load()},[]);

 function chooseBooking(item,startDate,endDate,pricing){
  setChosen({item,startDate,endDate,pricing});
  setFulfillment(item.pickupAvailable?"pickup":"delivery");
  setErr("");
  setMsg("");
  window.setTimeout(()=>document.getElementById("booking")?.scrollIntoView({behavior:"smooth",block:"start"}),50);
 }

 async function book(e){
  e.preventDefault();
  setErr("");
  setMsg("");
  if(!chosen?.item||!chosen.startDate||!chosen.endDate){
   setErr("Velg en leieperiode i kalenderen.");
   return;
  }
  setBooking(true);
  try{
   const r=await fetch("/api/rental-bookings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     itemId:chosen.item.id,
     startDate:chosen.startDate,
     endDate:chosen.endDate,
     customer,
     fulfillment,
     acceptedTerms:accepted,
     termsVersion:"2026-09"
    })
   });
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(d.error||"Kunne ikke sende booking.");
   setMsg("Takk! Booking "+d.bookingNumber+" er mottatt. Leiepris "+kr(d.totalOre)+(d.depositOre?" + depositum "+kr(d.depositOre):"")+".");
   setChosen(null);
   setAccepted(false);
   setCustomer({name:"",email:"",phone:"",address:""});
   setRefreshKey(value=>value+1);
   await load();
  }catch(e){
   setErr(e.message||"Kunne ikke sende booking.");
  }finally{
   setBooking(false);
  }
 }

 return <main className="catalogPage rentalPage">
  <CatalogHeader/>

  <section className="rentalHero">
   <div className="catalogWrap rentalHeroInner">
    <span className="catalogEyebrow">AADLAND SERVICE · UTLEIE</span>
    <h1>Lei utstyr når du trenger det.</h1>
    <p>Velg utstyret du vil leie og trykk ønsket periode direkte i kalenderen under produktet.</p>
    <div className="rentalHeroTrust"><span>✓ Kalender på hvert produkt</span><span>✓ Opptatte dager vises automatisk</span><span>✓ Pris før du sender forespørselen</span></div>
   </div>
  </section>

  <section className="rentalAvailabilitySection">
   <div className="catalogWrap">
    {msg&&<div className="rentalMessage success"><b>Booking mottatt</b><p>{msg}</p></div>}
    {err&&<div className="rentalMessage notice"><b>Noe gikk galt</b><p>{err}</p></div>}
    {setup&&<div className="catalogNotice"><b>Utleie åpner snart</b><p>Utleieoppsettet klargjøres. Kom gjerne tilbake snart.</p></div>}

    <div className="rentalSectionHead">
     <div><span className="catalogEyebrow">UTLEIEUTSTYR</span><h2>Velg utstyr og dato</h2><p>Hvert produkt har sin egen tilgjengelighetskalender.</p></div>
     {!loading&&!setup&&items.length>0&&<span>{items.length} {items.length===1?"produkt":"produkter"}</span>}
    </div>

    {loading?<div className="catalogStatus">Laster utleieutstyr …</div>:!items.length&&!setup?(
     <div className="catalogNotice"><b>Ingen utstyr publisert ennå</b><p>Utleieutstyr kommer her når det er klart.</p></div>
    ):(
     <div className="rentalProductList">
      {items.map(item=>{
       const image=item.imageUrls?.[0];
       const canFulfill=item.pickupAvailable||item.deliveryAvailable;
       return <article className="rentalProductCard" key={item.id}>
        <div className="rentalProductTop">
         <div className="rentalCardMedia">
          {image?<img src={image} alt={item.name}/>:<CatalogPlaceholder label="Utstyrsbilde kommer"/>}
          {item.status!=="available"&&<span className="rentalAvailabilityBadge unavailable">Midlertidig utilgjengelig</span>}
         </div>
         <div className="rentalCardBody">
          <span className="catalogEyebrow">UTLEIE</span>
          <h3>{item.name}</h3>
          {item.description&&<p>{item.description}</p>}
          <div className="rentalPrice"><b>{kr(item.dailyPriceOre)} / dag</b>{item.depositOre>0&&<small>Depositum {kr(item.depositOre)}</small>}</div>
          <div className="rentalFulfillment">
           {item.pickupAvailable&&<span>Henting</span>}
           {item.deliveryAvailable&&<span>Levering</span>}
          </div>
          {!canFulfill&&<p className="rentalCalendarError">Kontakt oss om utlevering før booking.</p>}
         </div>
        </div>
        {canFulfill&&<RentalProductCalendar item={item} onBook={chooseBooking} refreshKey={refreshKey}/>}
       </article>;
      })}
     </div>
    )}
   </div>
  </section>

  {chosen&&<section className="rentalBookingSection" id="booking">
   <div className="catalogWrap">
    <form className="rentalBookingCard" onSubmit={book}>
     <div className="rentalBookingIntro">
      <span className="catalogEyebrow">BOOKINGFORESPØRSEL</span>
      <h2>{chosen.item.name}</h2>
      <p>{displayDate(chosen.startDate)} – {displayDate(chosen.endDate)}</p>
      <div className="rentalBookingPrice"><b>{kr(chosen.pricing?.totalOre)}</b>{chosen.item.depositOre>0&&<span>+ depositum {kr(chosen.item.depositOre)}</span>}</div>
      <button type="button" className="rentalChangeDates" onClick={()=>{setChosen(null);window.scrollTo({top:0,behavior:"smooth"})}}>← Endre dato</button>
     </div>
     <div className="rentalBookingFields">
      <div className="rentalFormTwo">
       <label><span>Navn *</span><input autoComplete="name" required value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label>
       <label><span>Telefon *</span><input autoComplete="tel" required type="tel" value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></label>
      </div>
      <label><span>E-post *</span><input autoComplete="email" required type="email" value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/></label>
      <label><span>Adresse</span><input autoComplete="street-address" value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})}/></label>
      <label><span>Henting / levering</span><select value={fulfillment} onChange={e=>setFulfillment(e.target.value)}>{chosen.item.pickupAvailable&&<option value="pickup">Jeg henter selv</option>}{chosen.item.deliveryAvailable&&<option value="delivery">Jeg ønsker levering</option>}</select></label>
      <label className="rentalTerms"><input type="checkbox" required checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Jeg godtar <a href="/vilkar/utleie" target="_blank" rel="noreferrer">utleiebetingelsene</a>.</span></label>
      <div className="rentalBookingActions">
       <button className="catalogGoldButton" disabled={booking}>{booking?"Sender …":"Send bookingforespørsel →"}</button>
       <button type="button" className="rentalCancelButton" disabled={booking} onClick={()=>setChosen(null)}>Avbryt</button>
      </div>
     </div>
    </form>
   </div>
  </section>}

  <section className="catalogCallout rentalCallout">
   <div className="catalogWrap catalogCalloutInner">
    <div><span className="catalogEyebrow">SPØRSMÅL OM UTLEIE?</span><h2>Usikker på hvilket utstyr du trenger?</h2><p>Ta kontakt, så hjelper vi deg å finne en praktisk løsning til jobben.</p></div>
    <a href="/#befaring" className="catalogGoldButton">Kontakt oss →</a>
   </div>
  </section>

  <CatalogFooter/>
 </main>;
}
