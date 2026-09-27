"use client";

import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import Link from "next/link";
import {CatalogFooter,CatalogHeader,CatalogPlaceholder} from "../../produkter/ProductChrome";

const localToday=()=>{
 const d=new Date();
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return `${v.year}-${v.month}-${v.day}`;
};
const kr=o=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",maximumFractionDigits:0}).format((Number(o)||0)/100);
const displayDate=value=>value?new Date(value+"T12:00:00Z").toLocaleDateString("nb-NO",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}):"";
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

function RentalCalendar({item,onChoose,refreshKey}){
 const today=localToday();
 const currentMonth=today.slice(0,7);
 const [month,setMonth]=useState(currentMonth);
 const [unavailable,setUnavailable]=useState([]);
 const [loading,setLoading]=useState(true);
 const [start,setStart]=useState("");
 const [end,setEnd]=useState("");
 const [quote,setQuote]=useState(null);
 const [error,setError]=useState("");
 const [checking,setChecking]=useState(false);
 const blocked=new Set(unavailable);
 const cells=calendarDays(month);

 useEffect(()=>{
  fetch("/api/customer/profile")
   .then(async response=>{
    if(response.status===401)return null;
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return null;
    return data.customer||null;
   })
   .then(profile=>{
    if(!profile)return;
    setCustomerAccount(profile);
    setCustomer(current=>({
     ...current,
     name:current.name||profile.name||"",
     email:current.email||profile.email||"",
     phone:current.phone||profile.phone||"",
     address:current.address||profile.address||""
    }));
   })
   .catch(()=>{});
 },[]);

 useEffect(()=>{
  let cancelled=false;
  setLoading(true);
  setError("");
  fetch("/api/rental/calendar?itemId="+encodeURIComponent(item.id)+"&month="+month)
   .then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Kalenderen kunne ikke lastes.");
    return data;
   })
   .then(data=>{if(!cancelled)setUnavailable(Array.isArray(data.unavailableDates)?data.unavailableDates:[])})
   .catch(err=>{if(!cancelled)setError(err.message||"Kalenderen kunne ikke lastes.")})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[item.id,month,refreshKey]);

 useEffect(()=>{
  setStart("");
  setEnd("");
  setQuote(null);
 },[refreshKey]);

 function isDisabled(date){
  return date<today||blocked.has(date)||item.status!=="available";
 }
 function isSelected(date){
  if(!start)return false;
  if(!end)return date===start;
  return date>=start&&date<=end;
 }

 async function choose(date){
  if(isDisabled(date))return;
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
  setChecking(true);
  try{
   const response=await fetch("/api/rental?slug="+encodeURIComponent(item.slug)+"&start="+start+"&end="+date);
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Perioden kunne ikke kontrolleres.");
   const result=(data.items||[])[0];
   if(!result||!result.available){
    setEnd("");
    throw new Error("Perioden inneholder opptatte eller sperrede dager. Velg en annen periode.");
   }
   setQuote(result.pricing||null);
  }catch(err){
   setQuote(null);
   setError(err.message||"Perioden kunne ikke kontrolleres.");
  }finally{
   setChecking(false);
  }
 }

 return <section className="rentalDetailCalendar">
  <div className="rentalCalendarTitle">
   <div>
    <span className="catalogEyebrow">TILGJENGELIGHET</span>
    <h2>Velg leieperiode</h2>
    <p>{monthLabel(month)}</p>
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
   {cells.map((date,index)=>date?<button
    type="button"
    key={date}
    className={[
     "rentalCalendarDay",
     isDisabled(date)?"isUnavailable":"",
     isSelected(date)?"isSelected":"",
     date===start?"isStart":"",
     date===end?"isEnd":""
    ].filter(Boolean).join(" ")}
    disabled={isDisabled(date)}
    aria-pressed={isSelected(date)}
    onClick={()=>choose(date)}
   >{Number(date.slice(-2))}</button>:<span className="rentalCalendarBlank" key={"blank-"+index}/>)}
  </div>

  <div className="rentalCalendarLegend">
   <span><i className="isFree"></i>Ledig</span>
   <span><i className="isBusy"></i>Opptatt</span>
   <span><i className="isChosen"></i>Valgt</span>
  </div>

  {error&&<p className="rentalCalendarError">{error}</p>}

  {start&&<div className="rentalSelectionSummary">
   <div><small>Valgt periode</small><b>{displayDate(start)}{end?" – "+displayDate(end):" – velg sluttdato"}</b></div>
   {checking?<span>Sjekker pris …</span>:quote&&<>
    <div><small>Leiepris</small><b>{kr(quote.totalOre)}</b></div>
    {Number(item.depositOre)>0&&<div><small>Depositum</small><b>{kr(item.depositOre)}</b></div>}
   </>}
  </div>}

  {quote&&start&&end&&<button type="button" className="catalogGoldButton rentalCalendarBookButton" onClick={()=>onChoose(start,end,quote)}>
   Gå videre til booking →
  </button>}
 </section>;
}

export default function RentalDetailPage(){
 const params=useParams();
 const slug=decodeURIComponent(String(params?.slug||""));
 const [item,setItem]=useState(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [chosen,setChosen]=useState(null);
 const [customer,setCustomer]=useState({name:"",email:"",phone:"",address:""});
 const [customerAccount,setCustomerAccount]=useState(null);
 const [accepted,setAccepted]=useState(false);
 const [fulfillment,setFulfillment]=useState("pickup");
 const [booking,setBooking]=useState(false);
 const [message,setMessage]=useState("");
 const [refreshKey,setRefreshKey]=useState(0);
 const [activeImage,setActiveImage]=useState(0);

 useEffect(()=>{
  let cancelled=false;
  setLoading(true);
  fetch("/api/rental?slug="+encodeURIComponent(slug))
   .then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Utstyret kunne ikke lastes.");
    const found=(data.items||[])[0];
    if(!found)throw new Error("Utstyret ble ikke funnet.");
    return found;
   })
   .then(found=>{if(!cancelled)setItem(found)})
   .catch(err=>{if(!cancelled)setError(err.message||"Utstyret kunne ikke lastes.")})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[slug]);

 function choosePeriod(startDate,endDate,pricing){
  setChosen({startDate,endDate,pricing});
  setFulfillment(item.pickupAvailable?"pickup":"delivery");
  setMessage("");
  window.setTimeout(()=>document.getElementById("booking")?.scrollIntoView({behavior:"smooth",block:"start"}),50);
 }

 async function book(e){
  e.preventDefault();
  if(!item||!chosen)return;
  setBooking(true);
  setError("");
  try{
   const response=await fetch("/api/rental-bookings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     itemId:item.id,
     startDate:chosen.startDate,
     endDate:chosen.endDate,
     customer,
     fulfillment,
     acceptedTerms:accepted
    })
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Kunne ikke sende booking.");
   setMessage("Booking "+data.bookingNumber+" er mottatt. Vi tar kontakt med deg.");
   setChosen(null);
   setAccepted(false);
   setCustomer(customerAccount?{
    name:customerAccount.name||"",
    email:customerAccount.email||"",
    phone:customerAccount.phone||"",
    address:customerAccount.address||""
   }:{name:"",email:"",phone:"",address:""});
   setRefreshKey(value=>value+1);
  }catch(err){
   setError(err.message||"Kunne ikke sende booking.");
  }finally{
   setBooking(false);
  }
 }

 if(loading)return <main className="catalogPage rentalPage"><CatalogHeader/><div className="catalogWrap rentalDetailState">Laster utstyr …</div><CatalogFooter/></main>;
 if(!item)return <main className="catalogPage rentalPage"><CatalogHeader/><div className="catalogWrap rentalDetailState"><Link href="/utleie">← Tilbake til utleie</Link><h1>Utstyret ble ikke funnet</h1>{error&&<p>{error}</p>}</div><CatalogFooter/></main>;

 const images=item.imageUrls||[];
 const canFulfill=item.pickupAvailable||item.deliveryAvailable;

 return <main className="catalogPage rentalPage">
  <CatalogHeader/>

  <section className="rentalDetailHero">
   <div className="catalogWrap">
    <Link href="/utleie" className="rentalBackLink">← Tilbake til utleie</Link>
    <div className="rentalDetailGrid">
     <div className="rentalDetailGallery">
      <div className="rentalDetailMainImage">
       {images[activeImage]?<img src={images[activeImage]} alt={item.name}/>:<CatalogPlaceholder label="Utstyrsbilde kommer"/>}
      </div>
      {images.length>1&&<div className="rentalDetailThumbs">{images.map((image,index)=><button type="button" className={index===activeImage?"isActive":""} key={image+index} onClick={()=>setActiveImage(index)}><img src={image} alt=""/></button>)}</div>}
     </div>

     <div className="rentalDetailInfo">
      <span className="catalogEyebrow">{item.categoryName||"UTLEIE"}</span>
      <h1>{item.name}</h1>
      {item.description&&<p>{item.description}</p>}
      <div className="rentalDetailPricing">
       <div><small>Døgnpris</small><b>{kr(item.dailyPriceOre)}</b></div>
       {item.weekendPriceOre!=null&&<div><small>Helgepris</small><b>{kr(item.weekendPriceOre)}</b></div>}
       {item.weeklyPriceOre!=null&&<div><small>Ukepris</small><b>{kr(item.weeklyPriceOre)}</b></div>}
       {item.depositOre>0&&<div><small>Depositum</small><b>{kr(item.depositOre)}</b></div>}
      </div>
      <div className="rentalFulfillment">
       {item.pickupAvailable&&<span>Henting</span>}
       {item.deliveryAvailable&&<span>Levering</span>}
      </div>
      {item.status!=="available"&&<div className="catalogNotice"><b>Midlertidig utilgjengelig</b><p>Dette utstyret kan ikke bookes akkurat nå.</p></div>}
      {!canFulfill&&<div className="catalogNotice"><b>Kontakt oss om utlevering</b><p>Utleveringsmåte må avtales før booking.</p></div>}
     </div>
    </div>
   </div>
  </section>

  {message&&<div className="catalogWrap"><div className="rentalMessage success"><b>Booking mottatt</b><p>{message}</p>{customerAccount&&<Link className="catalogGoldButton" href="/min-side">Se bookingen på Min side →</Link>}</div></div>}
  {error&&<div className="catalogWrap"><div className="rentalMessage notice"><b>Noe gikk galt</b><p>{error}</p></div></div>}

  {canFulfill&&item.status==="available"&&<div className="catalogWrap rentalDetailCalendarWrap"><RentalCalendar item={item} onChoose={choosePeriod} refreshKey={refreshKey}/></div>}

  {chosen&&<section className="rentalBookingSection" id="booking">
   <div className="catalogWrap">
    <form className="rentalBookingCard" onSubmit={book}>
     <div className="rentalBookingIntro">
      <span className="catalogEyebrow">BOOKINGFORESPØRSEL</span>
      <h2>{item.name}</h2>
      <p>{displayDate(chosen.startDate)} – {displayDate(chosen.endDate)}</p>
      <div className="rentalBookingPrice"><b>{kr(chosen.pricing?.totalOre)}</b>{item.depositOre>0&&<span>+ depositum {kr(item.depositOre)}</span>}</div>
     </div>
     <div className="rentalBookingFields">
      {customerAccount&&<p className="customerPrefillNote">✓ Kontaktopplysninger er hentet fra Min side. Du kan endre dem for denne bookingen.</p>}
      <div className="rentalFormTwo">
       <label><span>Navn *</span><input autoComplete="name" required value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label>
       <label><span>Telefon *</span><input autoComplete="tel" required type="tel" value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></label>
      </div>
      <label><span>E-post *</span><input autoComplete="email" required type="email" value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/></label>
      <label><span>Adresse{fulfillment==="delivery"?" *":""}</span><input autoComplete="street-address" required={fulfillment==="delivery"} value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})}/></label>
      <label><span>Henting / levering</span><select value={fulfillment} onChange={e=>setFulfillment(e.target.value)}>{item.pickupAvailable&&<option value="pickup">Jeg henter selv</option>}{item.deliveryAvailable&&<option value="delivery">Jeg ønsker levering</option>}</select></label>
      <label className="rentalTerms"><input type="checkbox" required checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Jeg godtar <a href="/vilkar/utleie" target="_blank" rel="noreferrer">utleiebetingelsene</a>.</span></label>
      <div className="rentalBookingActions">
       <button className="catalogGoldButton" disabled={booking}>{booking?"Sender …":"Send bookingforespørsel →"}</button>
       <button type="button" className="rentalCancelButton" disabled={booking} onClick={()=>setChosen(null)}>Endre periode</button>
      </div>
     </div>
    </form>
   </div>
  </section>}

  <CatalogFooter/>
 </main>;
}
