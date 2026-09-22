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

export default function Utleie(){
 const [dates,setDates]=useState({start:"",end:""});
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
 const today=localToday();

 async function load(){
  setLoading(true);
  setErr("");
  try{
   const q=dates.start&&dates.end?"?start="+dates.start+"&end="+dates.end:"";
   const r=await fetch("/api/rental"+q);
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
 useEffect(()=>{if(dates.start&&dates.end&&dates.end>=dates.start)load()},[dates.start,dates.end]);

 async function book(e){
  e.preventDefault();
  setErr("");
  setMsg("");
  if(!chosen||!dates.start||!dates.end||dates.start<today||dates.end<dates.start){
   setErr("Velg en gyldig leieperiode.");
   return;
  }
  setBooking(true);
  try{
   const r=await fetch("/api/rental-bookings",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     itemId:chosen.id,
     startDate:dates.start,
     endDate:dates.end,
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
   await load();
  }catch(e){
   setErr(e.message||"Kunne ikke sende booking.");
  }finally{
   setBooking(false);
  }
 }

 const hasPeriod=Boolean(dates.start&&dates.end&&dates.end>=dates.start);

 return <main className="catalogPage rentalPage">
  <CatalogHeader/>

  <section className="rentalHero">
   <div className="catalogWrap rentalHeroInner">
    <span className="catalogEyebrow">AADLAND SERVICE · UTLEIE</span>
    <h1>Lei utstyr når du trenger det.</h1>
    <p>Velg perioden først. Da ser du hva som er ledig og hva leien koster før du sender bookingforespørselen.</p>
    <div className="rentalHeroTrust"><span>✓ Oversiktlig pris</span><span>✓ Tilgjengelighet per dato</span><span>✓ Henting eller levering der det tilbys</span></div>
   </div>
  </section>

  <section className="rentalAvailabilitySection">
   <div className="catalogWrap">
    <div className="rentalDatePanel">
     <div>
      <span className="catalogEyebrow">VELG LEIEPERIODE</span>
      <h2>Når trenger du utstyret?</h2>
      <p>Velg fra- og tildato for å se tilgjengelighet og totalpris.</p>
     </div>
     <div className="rentalDateFields">
      <label><span>Fra</span><input type="date" min={today} value={dates.start} onChange={e=>setDates({...dates,start:e.target.value,end:dates.end&&dates.end<e.target.value?e.target.value:dates.end})}/></label>
      <label><span>Til</span><input type="date" min={dates.start||today} value={dates.end} onChange={e=>setDates({...dates,end:e.target.value})}/></label>
     </div>
    </div>

    {msg&&<div className="rentalMessage success"><b>Booking mottatt</b><p>{msg}</p></div>}
    {err&&<div className="rentalMessage notice"><b>Noe gikk galt</b><p>{err}</p></div>}
    {setup&&<div className="catalogNotice"><b>Utleie åpner snart</b><p>Utleieoppsettet klargjøres. Kom gjerne tilbake snart.</p></div>}

    <div className="rentalSectionHead">
     <div><span className="catalogEyebrow">UTLEIEUTSTYR</span><h2>{hasPeriod?"Tilgjengelig i perioden":"Velg utstyr"}</h2></div>
     {!loading&&!setup&&items.length>0&&<span>{items.length} {items.length===1?"produkt":"produkter"}</span>}
    </div>

    {loading?<div className="catalogStatus">Sjekker tilgjengelighet …</div>:!items.length&&!setup?(
     <div className="catalogNotice"><b>Ingen utstyr publisert ennå</b><p>Utleieutstyr kommer her når det er klart.</p></div>
    ):(
     <div className="rentalGrid">
      {items.map(item=>{
       const image=item.imageUrls?.[0];
       const price=hasPeriod&&item.pricing?kr(item.pricing.totalOre):kr(item.dailyPriceOre)+" / dag";
       return <article className={"rentalCard "+(hasPeriod&&!item.available?"isUnavailable":"")} key={item.id}>
        <div className="rentalCardMedia">
         {image?<img src={image} alt={item.name}/>:<CatalogPlaceholder label="Utstyrsbilde kommer"/>}
         {hasPeriod&&<span className={"rentalAvailabilityBadge "+(item.available?"available":"unavailable")}>{item.available?"Ledig":"Opptatt"}</span>}
        </div>
        <div className="rentalCardBody">
         <span className="catalogEyebrow">UTLEIE</span>
         <h3>{item.name}</h3>
         {item.description&&<p>{item.description}</p>}
         <div className="rentalPrice"><b>{price}</b>{item.depositOre>0&&<small>Depositum {kr(item.depositOre)}</small>}</div>
         <div className="rentalFulfillment">
          {item.pickupAvailable&&<span>Henting</span>}
          {item.deliveryAvailable&&<span>Levering</span>}
         </div>
         {hasPeriod?(
          <button className="catalogGoldButton rentalChooseButton" type="button" disabled={!item.available} onClick={()=>{setChosen(item);setFulfillment(item.pickupAvailable?"pickup":"delivery");setErr("");setMsg("")}}>
           {item.available?"Velg dette utstyret →":"Opptatt i perioden"}
          </button>
         ):<small className="rentalHint">Velg dato øverst for å se tilgjengelighet og totalpris.</small>}
        </div>
       </article>
      })}
     </div>
    )}
   </div>
  </section>

  {chosen&&<section className="rentalBookingSection">
   <div className="catalogWrap">
    <form className="rentalBookingCard" onSubmit={book}>
     <div className="rentalBookingIntro">
      <span className="catalogEyebrow">BOOKINGFORESPØRSEL</span>
      <h2>{chosen.name}</h2>
      <p>{dates.start} – {dates.end}</p>
      <div className="rentalBookingPrice"><b>{kr(chosen.pricing?.totalOre)}</b>{chosen.depositOre>0&&<span>+ depositum {kr(chosen.depositOre)}</span>}</div>
     </div>
     <div className="rentalBookingFields">
      <div className="rentalFormTwo">
       <label><span>Navn *</span><input autoComplete="name" required value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label>
       <label><span>Telefon *</span><input autoComplete="tel" required type="tel" value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})}/></label>
      </div>
      <label><span>E-post *</span><input autoComplete="email" required type="email" value={customer.email} onChange={e=>setCustomer({...customer,email:e.target.value})}/></label>
      <label><span>Adresse</span><input autoComplete="street-address" value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})}/></label>
      <label><span>Henting / levering</span><select value={fulfillment} onChange={e=>setFulfillment(e.target.value)}>{chosen.pickupAvailable&&<option value="pickup">Jeg henter selv</option>}{chosen.deliveryAvailable&&<option value="delivery">Jeg ønsker levering</option>}</select></label>
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
