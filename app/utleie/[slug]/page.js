"use client";

import {useEffect,useRef,useState} from "react";
import {rentalDaysInclusive,rentalCalendarReady,validRentalCalendarQuote} from "../../../lib/rentalCalendarSelection.mjs";
import {useParams} from "next/navigation";
import PickupWindows from "../PickupWindows";
import {RENTAL_CHANGE_DEADLINE_HOURS} from "../../../lib/companyInfo";
import {RENTAL_TERMS_VERSION,RENTAL_TERMS_PATH} from "../../../lib/rentalTermsVersion.mjs";
import Link from "next/link";
import {CatalogFooter,CatalogHeader,CatalogPlaceholder} from "../../produkter/ProductChrome";

const localToday=()=>{
 const d=new Date();
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return `${v.year}-${v.month}-${v.day}`;
};
const kr=o=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:0,maximumFractionDigits:2}).format((Number(o)||0)/100);
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

function RentalCalendar({item,onChoose,onSelectionChange,refreshKey}){
 const today=localToday();
 const currentMonth=today.slice(0,7);
 const [month,setMonth]=useState(currentMonth);
 const [monthData,setMonthData]=useState(null);
 const [monthError,setMonthError]=useState("");
 const [retry,setRetry]=useState(0);
 const requestKey=refreshKey+":"+retry;
 const ready=rentalCalendarReady(monthData,item.id,month,requestKey);
 const loading=!ready&&!monthError;
 const [start,setStart]=useState("");
 const [end,setEnd]=useState("");
 const [quote,setQuote]=useState(null);
 const [error,setError]=useState("");
 const [checking,setChecking]=useState(false);
 const quoteRequest=useRef(null);
 const blocked=new Set(ready?monthData.unavailableDates:[]);
 const cells=calendarDays(month);

 useEffect(()=>{
  let cancelled=false;
  const controller=new AbortController();
  setMonthError("");
  fetch("/api/rental/calendar?itemId="+encodeURIComponent(item.id)+"&month="+month,{cache:"no-store",signal:controller.signal})
   .then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Kalenderen kunne ikke lastes.");
    if(data.itemId!==item.id||data.month!==month||!Array.isArray(data.unavailableDates))throw new Error("Kalenderdataene kunne ikke kontrolleres.");
    return data;
   })
   .then(data=>{if(!cancelled)setMonthData({...data,requestKey})})
   .catch(err=>{if(!cancelled)setMonthError(err.message||"Kalenderen kunne ikke lastes.")});
  return()=>{cancelled=true;controller.abort()};
 },[item.id,month,requestKey]);

 useEffect(()=>{
  setStart("");setEnd("");setQuote(null);setError("");setChecking(false);
  return()=>{quoteRequest.current?.abort();quoteRequest.current=null;};
 },[item.id,refreshKey]);

 function resetSelection(){
  quoteRequest.current?.abort();quoteRequest.current=null;
  setStart("");setEnd("");setQuote(null);setError("");setChecking(false);
  onSelectionChange();
 }
 function changeMonth(amount){
  setMonthError("");
  setMonth(current=>shiftMonth(current,amount));
 }
 function isDisabled(date){
  return !ready||checking||date<today||blocked.has(date)||item.status!=="available";
 }
 function isSelected(date){
  if(!start)return false;
  if(!end)return date===start;
  return date>=start&&date<=end;
 }

 async function choose(date){
  if(isDisabled(date)||quoteRequest.current)return;
  setError("");onSelectionChange();
  if(!start||end||date<start){
   setStart(date);setEnd("");setQuote(null);
   return;
  }
  const days=rentalDaysInclusive(start,date);
  if(!days||days>365){setError("Velg en leieperiode på maksimalt 365 dager.");return;}
  const controller=new AbortController();
  quoteRequest.current=controller;
  setEnd(date);setQuote(null);setChecking(true);
  try{
   const response=await fetch("/api/rental?slug="+encodeURIComponent(item.slug)+"&start="+start+"&end="+date,{cache:"no-store",signal:controller.signal});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Perioden kunne ikke kontrolleres.");
   const result=(data.items||[])[0];
   if(!validRentalCalendarQuote(result,item.id,start,date))throw new Error("Perioden eller prisen kunne ikke bekreftes. Velg en annen periode eller prøv igjen.");
   if(quoteRequest.current===controller)setQuote(result.pricing);
  }catch(err){
   if(quoteRequest.current===controller&&!controller.signal.aborted){
    setEnd("");setQuote(null);setError(err.message||"Perioden kunne ikke kontrolleres.");
   }
  }finally{
   if(quoteRequest.current===controller){quoteRequest.current=null;setChecking(false);}
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
    <button type="button" disabled={checking||month<=currentMonth} aria-label="Forrige måned" onClick={()=>changeMonth(-1)}>←</button>
    <button type="button" disabled={checking} aria-label="Neste måned" onClick={()=>changeMonth(1)}>→</button>
   </div>
  </div>

  <p className="rentalCalendarHelp">{start&&!end?"Velg siste leiedag. Trykk samme dato for å leie én dag.":"Trykk første og siste dagen du ønsker å leie."}</p>
  {loading&&<p role="status">Henter tilgjengelighet …</p>}
  {monthError&&<div className="rentalCalendarError" role="alert">{monthError} <button type="button" className="rentalCalendarRetry" onClick={()=>{setMonthError("");setRetry(x=>x+1)}}>Prøv igjen</button></div>}

  <div className="rentalCalendarWeekdays" aria-hidden="true">
   {["Man","Tir","Ons","Tor","Fre","Lør","Søn"].map(day=><span key={day}>{day}</span>)}
  </div>
  <div className={"rentalCustomerCalendar "+(loading?"isLoading":"")} aria-busy={loading}>
   {cells.map((date,index)=>date?<button
    type="button"
    key={date}
    className={[
     "rentalCalendarDay",
     (ready&&(date<today||blocked.has(date)||item.status!=="available"))?"isUnavailable":"",
     isSelected(date)?"isSelected":"",
     date===start?"isStart":"",
     date===end?"isEnd":""
    ].filter(Boolean).join(" ")}
    disabled={isDisabled(date)}
    aria-pressed={isSelected(date)}
    aria-label={displayDate(date)+(ready?(date<today?", passert":blocked.has(date)?", opptatt":", ledig"):", tilgjengelighet ikke kontrollert")}
    onClick={()=>choose(date)}
   >{Number(date.slice(-2))}</button>:<span className="rentalCalendarBlank" key={"blank-"+index}/>)}
  </div>

  <div className="rentalCalendarLegend">
   <span><i className="isFree"></i>Ledig</span>
   <span><i className="isBusy"></i>Opptatt</span>
   <span><i className="isChosen"></i>Valgt</span>
  </div>

  {error&&<p className="rentalCalendarError" role="alert">{error}</p>}

  {start&&<div className="rentalSelectionSummary">
   <div><small>Valgt periode</small><b>{displayDate(start)}{end?" – "+displayDate(end):" – velg sluttdato"}</b></div>
   {checking?<span role="status">Sjekker hele perioden og pris …</span>:quote&&<>
    <div><small>Leiedager</small><b>{quote.days}</b></div>
    <div><small>Leiepris inkl. mva.</small><b>{kr(quote.totalOre)}</b></div>
    {quote.discountOre>0&&<div><small>Langtidsrabatt</small><b>−{kr(quote.discountOre)}</b></div>}
    {quote.depositOre>0&&<div><small>Depositum</small><b>{kr(quote.depositOre)}</b></div>}
   </>}
  </div>}

  {start&&<button type="button" className="rentalCalendarRetry" onClick={resetSelection}>Nullstill datoer</button>}
  {ready&&quote&&start&&end&&!checking&&<button type="button" className="catalogGoldButton rentalCalendarBookButton" onClick={()=>onChoose(start,end,quote)}>
   Gå videre til booking →
  </button>}
 </section>;
}

export default function RentalDetailPage(){
 const params=useParams();
 const slug=decodeURIComponent(String(params?.slug||""));
 const [item,setItem]=useState(null);
 const [bookingOpen,setBookingOpen]=useState(false);
 const [cartEnabled,setCartEnabled]=useState(false);
 const [windowConfig,setWindowConfig]=useState({enabled:false});
 const [pickupWindow,setPickupWindow]=useState("");
 const [returnWindow,setReturnWindow]=useState("");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [chosen,setChosen]=useState(null);
 const [customer,setCustomer]=useState({name:"",email:"",phone:"",address:""});
 const [customerAccount,setCustomerAccount]=useState(null);
 const [customerType,setCustomerType]=useState("private");
 const [company,setCompany]=useState({name:"",organizationNumber:"",invoiceEmail:""});
 const [accepted,setAccepted]=useState(false);
 const [fulfillment,setFulfillment]=useState("pickup");
 const [booking,setBooking]=useState(false);
 const [message,setMessage]=useState("");
 const [paymentUrl,setPaymentUrl]=useState("");
 const [refreshKey,setRefreshKey]=useState(0);
 const [activeImage,setActiveImage]=useState(0);
 const [repeatFulfillment,setRepeatFulfillment]=useState("");

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
  try{
   const raw=sessionStorage.getItem("aadlandRepeatRental");
   if(raw){
    const repeat=JSON.parse(raw);
    if(String(repeat?.slug||"")===slug){
     setRepeatFulfillment(repeat?.fulfillment==="delivery"?"delivery":"pickup");
     sessionStorage.removeItem("aadlandRepeatRental");
    }
   }
  }catch{}
 },[slug]);

 useEffect(()=>{
  let cancelled=false;
  setLoading(true);
  fetch("/api/rental?slug="+encodeURIComponent(slug))
   .then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Utstyret kunne ikke lastes.");
    const found=(data.items||[])[0];
    if(!found)throw new Error("Utstyret ble ikke funnet.");
    return {found,open:data.bookingOpen===true,cart:data.cartEnabled===true,windows:data.pickupWindows||{enabled:false}};
   })
   .then(({found,open,cart,windows})=>{if(!cancelled){setItem(found);setBookingOpen(open);setCartEnabled(cart);setWindowConfig(windows);}})
   .catch(err=>{if(!cancelled)setError(err.message||"Utstyret kunne ikke lastes.")})
   .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[slug]);

 function choosePeriod(startDate,endDate,pricing){
  setChosen({startDate,endDate,pricing});
  setPickupWindow("");setReturnWindow("");setAccepted(false);
  const preferred=repeatFulfillment==="delivery"&&item.deliveryAvailable
   ?"delivery"
   :repeatFulfillment==="pickup"&&item.pickupAvailable
   ?"pickup"
   :item.pickupAvailable?"pickup":"delivery";
  setFulfillment(preferred);
  setRepeatFulfillment("");
  setMessage("");
  setPaymentUrl("");
  window.setTimeout(()=>document.getElementById("booking")?.scrollIntoView({behavior:"smooth",block:"start"}),50);
 }

 async function book(e){
  e.preventDefault();
  if(!bookingOpen||!item||!chosen||booking)return;
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
     expectedPricing:{totalOre:chosen.pricing.totalOre,depositOre:chosen.pricing.depositOre},
     customer,
     customerType,
     ...(customerType==="company"?{company}:{}),
     fulfillment,pickupWindow,returnWindow,
     acceptedTerms:accepted,termsVersion:RENTAL_TERMS_VERSION
    })
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok){
    if(data.code==="RENTAL_NOT_OPEN"){setBookingOpen(false);setChosen(null);}
    if(data.code==="RENTAL_TERMS_CHANGED")setAccepted(false);
    if(data.code==="RENTAL_PRICE_CHANGED"){setChosen(null);setAccepted(false);setRefreshKey(value=>value+1);}
    throw new Error(data.error||"Kunne ikke sende booking.");
   }
   setMessage(data.message||("Booking "+data.bookingNumber+" er registrert. Sjekk innboks og søppelpost for e-post om leien."));
   setPaymentUrl(data.paymentPending?data.paymentUrl||"":"");
   setChosen(null);
   setAccepted(false);
   setCustomerType("private");
   setCompany({name:"",organizationNumber:"",invoiceEmail:""});
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

 if(loading)return <main className="catalogPage rentalPage"><CatalogHeader rental/><div className="catalogWrap rentalDetailState">Laster utstyr …</div><CatalogFooter rental/></main>;
 if(!item)return <main className="catalogPage rentalPage"><CatalogHeader rental/><div className="catalogWrap rentalDetailState"><Link href="/utleie">← Tilbake til utleie</Link><h1>Utstyret ble ikke funnet</h1>{error&&<p>{error}</p>}</div><CatalogFooter rental/></main>;

 const images=item.imageUrls||[];
 const canFulfill=item.pickupAvailable||item.deliveryAvailable;

 return <main className="catalogPage rentalPage">
  <CatalogHeader rental/>
  {bookingOpen&&cartEnabled&&<div className="catalogWrap" style={{paddingTop:16}}><Link className="catalogGoldButton" href={"/utleie/handlekurv?itemId="+encodeURIComponent(item.id)}>Legg utstyr i leiehandlekurv →</Link></div>}

  <section className="rentalDetailHero">
   <div className="catalogWrap">
    <Link href="/utleie" className="rentalBackLink">← Tilbake til utleie</Link>
    <div className="rentalDetailGrid">
     <div className="rentalDetailGallery">
      <div className="rentalDetailMainImage">
       {images[activeImage]?<img src={images[activeImage]} alt={item.name}/>:<CatalogPlaceholder rental label="Utstyrsbilde kommer"/>}
      </div>
      {images.length>1&&<div className="rentalDetailThumbs">{images.map((image,index)=><button type="button" className={index===activeImage?"isActive":""} key={image+index} aria-label={`Vis produktbilde ${index+1}`} aria-pressed={index===activeImage} onClick={()=>setActiveImage(index)}><img src={image} alt=""/></button>)}</div>}
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
      <p className="rentalPriceNote">Leiepriser inkl. mva. Depositum er separat.</p>
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

  {message&&<div className="catalogWrap"><div className="rentalMessage success"><b>{paymentUrl?"Fullfør betalingen":"Booking registrert"}</b><p>{message}</p>{paymentUrl&&<a className="catalogGoldButton" href={paymentUrl}>Gå videre til Vipps-betaling →</a>}<p><strong>Finner du ikke e-posten, sjekk søppelpost/spam.</strong></p>{customerAccount&&<Link className="catalogGoldButton" href="/min-side">Se bookingen på Min side →</Link>}</div></div>}
  {error&&<div className="catalogWrap"><div className="rentalMessage notice"><b>Noe gikk galt</b><p>{error}</p></div></div>}

  {!bookingOpen&&<div className="catalogWrap"><div className="catalogNotice"><b>Utleie åpner senere</b><p>Vi klargjør utstyr og betalingsløsning. Bestilling er ikke åpen ennå.</p><Link href="/utleie/kontakt">Kontakt oss</Link></div></div>}
  {bookingOpen&&canFulfill&&item.status==="available"&&<div className="catalogWrap rentalDetailCalendarWrap"><RentalCalendar key={item.id} item={item} onChoose={choosePeriod} onSelectionChange={()=>{setChosen(null);setAccepted(false);}} refreshKey={refreshKey}/></div>}

  {bookingOpen&&chosen&&<section className="rentalBookingSection" id="booking">
   <div className="catalogWrap">
    <form className="rentalBookingCard" onSubmit={book}>
     <div className="rentalBookingIntro">
      <span className="catalogEyebrow">BOOKING</span>
      <h2>{item.name}</h2>
      <p>{displayDate(chosen.startDate)} – {displayDate(chosen.endDate)}</p>
      <div className="rentalBookingPrice"><b>{kr(chosen.pricing?.totalOre)}</b>{chosen.pricing?.depositOre>0&&<span>+ depositum {kr(chosen.pricing.depositOre)}</span>}</div>
      {item.depositOre>0&&<p className="muted" style={{fontSize:12,marginTop:8}}>Depositum er en separat sikkerhet for utstyret. Det trekkes eller reserveres ikke automatisk med Vipps ved denne bestillingen.</p>}
     </div>
     <div className="rentalBookingFields">
      <div className="rentalFormTwo" role="group" aria-label="Kundetype">
       <label><input type="radio" name="rental-customer-type" checked={customerType==="private"} onChange={()=>setCustomerType("private")}/> Privatperson</label>
       <label><input type="radio" name="rental-customer-type" checked={customerType==="company"} onChange={()=>setCustomerType("company")}/> Bedrift</label>
      </div>
      {customerType==="company"&&<div className="rentalCompanyFields" style={{border:"1px solid #b6a68f",borderRadius:12,padding:14,margin:"12px 0"}}>
       <h3>Bedrift og fakturaopplysninger</h3>
       <label><span>Firmanavn *</span><input required maxLength={180} autoComplete="organization" value={company.name} onChange={e=>setCompany({...company,name:e.target.value})}/></label>
       <label><span>Organisasjonsnummer (9 sifre) *</span><input required type="text" inputMode="numeric" pattern="[0-9 ]{9,14}" value={company.organizationNumber} onChange={e=>setCompany({...company,organizationNumber:e.target.value})}/></label>
       <label><span>Faktura-e-post (valgfritt)</span><input type="email" autoComplete="email" value={company.invoiceEmail} onChange={e=>setCompany({...company,invoiceEmail:e.target.value})}/></label>
       <p className="muted">Faktura forutsetter at bedriften har en godkjent kundekonto og kredittavtale hos oss. Nye bedriftsbestillinger blir ikke automatisk innvilget fakturakreditt.</p>
      </div>}
      {customerType==="private"&&<p className="muted">Privatkunder får betalingsinformasjon for Vipps når utleiebetaling er aktivert. Sikkerhetsdepositum reserveres ikke automatisk ennå.</p>}
      {customerAccount&&<p className="customerPrefillNote">✓ Kontaktopplysninger er hentet fra Min side. Du kan endre dem for denne bookingen.</p>}
      <div className="rentalFormTwo">
       <label><span>Navn *</span><input autoComplete="name" required value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label>
       <label><span>Telefon *</span><input autoComplete="tel" required type="tel" value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></label>
      </div>
      <label><span>E-post *</span><input autoComplete="email" required type="email" value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/></label>
      <label><span>Adresse{fulfillment==="delivery"?" *":""}</span><input autoComplete="street-address" required={fulfillment==="delivery"} value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})}/></label>
      <label><span>Henting / levering</span><select value={fulfillment} onChange={e=>{setFulfillment(e.target.value);setPickupWindow("");setReturnWindow("");setAccepted(false);}}>{item.pickupAvailable&&<option value="pickup">Jeg henter selv</option>}{item.deliveryAvailable&&<option value="delivery">Jeg ønsker levering</option>}</select></label>
      {fulfillment==="pickup"&&windowConfig.enabled&&<PickupWindows config={windowConfig} start={chosen.startDate} end={chosen.endDate} pickup={pickupWindow} returning={returnWindow} onPickup={v=>{setPickupWindow(v);setAccepted(false);}} onReturn={v=>{setReturnWindow(v);setAccepted(false);}} disabled={booking}/>}
      <div className="rentalTermsNotice"><b>Endring og avbestilling</b><span>Gratis frem til {RENTAL_CHANGE_DEADLINE_HOURS} timer før avtalt leiestart. Se vilkårene for detaljer.</span></div>
      <label className="rentalTerms"><input type="checkbox" required checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>Jeg har lest og godtar <a href={RENTAL_TERMS_PATH} target="_blank" rel="noreferrer">utleiebetingelsene ({RENTAL_TERMS_VERSION})</a>, inkludert fristene for endring og avbestilling.</span></label>
      <p className="muted">Slik behandler vi kontakt- og bookingopplysninger: <a href="/personvern" target="_blank" rel="noreferrer">Personvernerklæring</a>.</p>
      <div className="rentalBookingActions">
       <button className="catalogGoldButton" disabled={booking||(fulfillment==="pickup"&&windowConfig.enabled&&(!pickupWindow||!returnWindow))}>{booking?"Sender …":"Send booking →"}</button>
       <button type="button" className="rentalCancelButton" disabled={booking} onClick={()=>setChosen(null)}>Endre periode</button>
      </div>
     </div>
    </form>
   </div>
  </section>}

  <CatalogFooter rental/>
 </main>;
}
