"use client";

import {useState} from "react";
import Link from "next/link";

export default function TestReceiptClient(){
 const [email,setEmail]=useState("");
 const [customerName,setCustomerName]=useState("Marius");
 const [customerPhone,setCustomerPhone]=useState("999 99 999");
 const [customerAddress,setCustomerAddress]=useState("Eksempelveien 12, 5000 Bergen");
 const [reference,setReference]=useState("TEST-VIPPS-12345");
 const [orderNote,setOrderNote]=useState("Ring ca. 30 minutter før levering. Plantekassene ønskes levert ferdig montert og settes ved inngangen.");
 const [quoteNote,setQuoteNote]=useState("Avtalt oljet overflate på benken. Levering og plassering inngår i avtalt pris.");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");

 async function send(e){
  e.preventDefault();
  setBusy(true);setMessage("");setError("");
  try{
   const response=await fetch("/api/admin/test-receipt",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,customerName,customerPhone,customerAddress,reference,orderNote,quoteNote})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Testkvitteringen kunne ikke sendes.");
   setMessage("Full testkvittering med PDF-vedlegg er sendt til "+(data.sentTo||email)+".");
  }catch(err){
   setError(err.message||"Testkvitteringen kunne ikke sendes.");
  }finally{
   setBusy(false);
  }
 }

 return <main className="admin">
  <section className="adminmain" style={{marginLeft:0,maxWidth:800}}>
   <Link href="/admin">← Tilbake til backoffice</Link>
   <div className="kicker" style={{marginTop:28}}>PREVIEW / TEST</div>
   <h1>Full test av kvittering</h1>
   <div className="card">
    <p><b>Denne testen endrer ingen bestilling og registrerer ingen betaling.</b></p>
    <p className="muted">Testen fyller kvitteringen med flere varer, variantvalg, antall, stykkpris, frakt, kunde-/leveringsinfo, ordrenotat, tilbudsnotat og MVA. Det følger også med en utskriftsvennlig PDF som vedlegg. Eksempelsummen er 10 550 kr.</p>
    <form onSubmit={send}>
     <div className="field"><label>Send testen til e-post</label><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="din@epost.no"/></div>
     <div className="field"><label>Kundenavn</label><input maxLength={120} value={customerName} onChange={e=>setCustomerName(e.target.value)}/></div>
     <div className="field"><label>Telefon</label><input maxLength={40} value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)}/></div>
     <div className="field"><label>Adresse</label><input maxLength={500} value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)}/></div>
     <div className="field"><label>Betalingsreferanse</label><input maxLength={120} value={reference} onChange={e=>setReference(e.target.value)}/></div>
     <div className="field"><label>Merknad til ordren</label><textarea rows="3" maxLength={2000} value={orderNote} onChange={e=>setOrderNote(e.target.value)}/></div>
     <div className="field"><label>Notat fra tilbud / avtale</label><textarea rows="3" maxLength={4000} value={quoteNote} onChange={e=>setQuoteNote(e.target.value)}/></div>
     {error&&<p className="notice">{error}</p>}
     {message&&<p className="success">{message}</p>}
     <button className="btn" disabled={busy}>{busy?"Sender …":"Send full test-kvittering"}</button>
    </form>
   </div>
  </section>
 </main>;
}
