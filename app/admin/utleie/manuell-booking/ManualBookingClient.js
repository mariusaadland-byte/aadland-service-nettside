"use client";
import {useRef,useState} from "react";
import Link from "next/link";
import PickupWindows from "../../../utleie/PickupWindows";
import {calculateRentalPrice} from "../../../../lib/rentalPricing.mjs";
import {RENTAL_TERMS_VERSION,RENTAL_TERMS_PATH} from "../../../../lib/rentalTermsVersion.mjs";
import styles from "../eget-bruk/ownUse.module.css";
const blank={itemId:"",startDate:"",endDate:"",name:"",email:"",phone:"",channel:"phone",pickupWindow:"",returnWindow:"",customerAccepted:false};
const kr=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
export default function ManualBookingClient({items,today,enabled,windowConfig={enabled:false}}){
 const [v,setV]=useState(blank),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(null);
 const lock=useRef(false),request=useRef(null);
 const item=items.find(i=>i.id===v.itemId),price=item?calculateRentalPrice(item,v.startDate,v.endDate):null;
 function change(e){const {name,value,type,checked}=e.target;setV(x=>({...x,[name]:type==="checkbox"?checked:value,...(name==="customerAccepted"?{}:{customerAccepted:false}),...(["itemId","startDate","endDate"].includes(name)?{pickupWindow:"",returnWindow:""}:{})}));request.current=null;setError("");}
 async function submit(e){
  e.preventDefault();if(lock.current||!enabled||!price||!v.customerAccepted)return;
  if(!window.confirm("Opprette en bekreftet, ubetalt booking til "+kr(price.totalOre)+" med separat depositum "+kr(price.depositOre)+"?"))return;
  lock.current=true;setBusy(true);setError("");
  try{if(!request.current)request.current=crypto.randomUUID();
   const r=await fetch("/api/admin/rental/manual-booking",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...v,requestId:request.current,acceptedTerms:true,termsVersion:RENTAL_TERMS_VERSION,confirm:true,expectedPricing:{totalOre:price.totalOre,depositOre:price.depositOre}})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Lagringen kunne ikke bekreftes.");
   setSaved(d);request.current=null;setV(blank);
  }catch(e){setError(e.message||"Kontroller bookinglisten før nytt forsøk.");}finally{lock.current=false;setBusy(false);}
 }
 if(saved)return <section className={styles.panel}><h2>Booking registrert</h2><p><b>{saved.bookingNumber}</b></p><p>Status: {saved.status}. Ingen ny betaling eller e-post sendt fra dette skjemaet.</p><p><Link href="/admin?vis=rentalBookings">Åpne bookinglisten</Link></p><button onClick={()=>setSaved(null)}>Ny booking</button></section>;
 return <form className={styles.panel} onSubmit={submit}><h2>Utstyr og periode</h2>
 {items.length===0&&<p>Ingen aktive produkter med henting. Registrer utstyr først.</p>}
 <label>Utstyr<select name="itemId" value={v.itemId} onChange={change} required disabled={busy}><option value="">Velg utstyr</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
 <div className={styles.dates}><label>Fra<input type="date" name="startDate" required min={today} value={v.startDate} onChange={change} disabled={busy}/></label><label>Til og med<input type="date" name="endDate" required min={v.startDate||today} value={v.endDate} onChange={change} disabled={busy}/></label></div>
 {windowConfig.enabled&&<PickupWindows config={windowConfig} start={v.startDate} end={v.endDate} pickup={v.pickupWindow} returning={v.returnWindow} onPickup={value=>change({target:{name:"pickupWindow",value}})} onReturn={value=>change({target:{name:"returnWindow",value}})} disabled={busy}/>}
 {price&&<section><h3>Prisoversikt</h3><p>{price.days} dager · Leie inkl. mva.: <b>{kr(price.totalOre)}</b></p><p>Depositum separat: <b>{kr(price.depositOre)}</b></p><p>Tilgjengeligheten kontrolleres ved lagring.</p></section>}
 <h2>Kundeopplysninger</h2><label>Bestillingskanal<select name="channel" value={v.channel} onChange={change} disabled={busy}><option value="phone">Telefon</option><option value="in_person">Personlig oppmøte</option></select></label>
 <label>Navn<input name="name" autoComplete="off" required maxLength={120} value={v.name} onChange={change} disabled={busy}/></label><label>E-post<input type="email" name="email" required maxLength={254} value={v.email} onChange={change} disabled={busy}/></label><label>Telefon<input type="tel" name="phone" required maxLength={40} value={v.phone} onChange={change} disabled={busy}/></label>
 <p><a href={RENTAL_TERMS_PATH} target="_blank" rel="noreferrer">Utleievilkår {RENTAL_TERMS_VERSION}</a>. Gi kunden vilkårene og prisinformasjonen. Ved telefonbestilling må eventuelle krav til skriftlig aksept og angrerett være avklart før lagring.</p>
 <label style={{display:"flex",alignItems:"flex-start",gap:10}}><input style={{width:22,minHeight:22,flexShrink:0}} type="checkbox" name="customerAccepted" checked={v.customerAccepted} onChange={change} disabled={busy} required/> Jeg har dokumentert kundens godkjenning av utstyr, periode, pris, depositum og gjeldende vilkår.</label>
 {error&&<p role="alert" className={styles.error}>{error}</p>}<button type="submit" disabled={!enabled||busy||!price||!v.customerAccepted||(windowConfig.enabled&&(!v.pickupWindow||!v.returnWindow))}>{busy?"Lagrer …":"Opprett ubetalt booking"}</button></form>;
}
