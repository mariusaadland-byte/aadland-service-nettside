"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";

const initial=()=>({customerType:"private",name:"",email:"",phone:"",
 address:"",organizationNumber:"",contactPerson:"",
 paymentTermsDays:14,preferredPaymentMethod:"bank"});
const label={display:"grid",gap:5,fontSize:13,fontWeight:650};
const entry={width:"100%",minWidth:0,maxWidth:"100%"};
const split={display:"grid",gap:10,
 gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,190px),1fr))"};
const norm=x=>String(x||"").trim().replace(/\s+/g," ").toLocaleLowerCase("nb-NO");
const text=x=>String(x||"").trim();
export default function InvoiceCustomerCardButton({
 invoiceKind,invoiceId,caption="Kundekort"
}){
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false),[data,setData]=useState(null);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [filter,setFilter]=useState("");
 const [creating,setCreating]=useState(false);
 const [form,setForm]=useState(initial);
 const [similarReviewed,setSimilarReviewed]=useState(false);
 const [savedContact,setSavedContact]=useState(null);
 const dialogRef=useRef(null);
 const inFlight=useRef(false);
 const change=(key,value)=>{setForm(prev=>({...prev,[key]:value}));setNotice("");};
 async function load(){
  const q=new URLSearchParams({kind:invoiceKind,id:invoiceId});
  const response=await fetch("/api/admin/invoices/customer-card?"+q,{cache:"no-store"});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.ok)
   throw Error(payload.error||"Kundekortet kunne ikke hentes.");
  setData(payload);
  return payload;
 }
 async function openDialog(){
  if(loading||busy)return;
  setOpen(true);setLoading(true);setError("");setNotice("");
  setCreating(false);setFilter("");setSimilarReviewed(false);setSavedContact(null);
  try{
   const fetched=await load();
   const invoice=fetched.invoice||{};
   setForm({customerType:invoice.customerType||"private",name:invoice.name||"",
    email:invoice.email||"",phone:invoice.phone||"",address:invoice.address||"",
    organizationNumber:invoice.organizationNumber||"",
    contactPerson:invoice.contactPerson||"",
    paymentTermsDays:14,preferredPaymentMethod:"bank"});
   setFilter(invoice.name||"");
  }catch(e){setError(e.message||"Kundekortet kunne ikke lastes.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{
  if(open)dialogRef.current?.focus();
 },[open]);
 function close(){
  if(busy)return;
  setOpen(false);setData(null);setError("");setNotice("");
 }
 const candidates=(data?.customers||[]).filter(c=>
  !filter||[c.name,c.email,c.phone,c.organization_number]
   .some(v=>norm(v).includes(norm(filter))));
 const suggestions=(data?.customers||[]).filter(c=>
  norm(c.name)===norm(form.name)||
  Boolean(form.email&&norm(c.email)===norm(form.email))||
  Boolean(form.organizationNumber&&
   c.organization_number===form.organizationNumber));
 async function linkContact(contact){
  if(busy||inFlight.current)return;
  if(!window.confirm("Koble faktura "+(data?.invoice?.number||"")+
   " til kundekortet «"+contact.name+"» i Aadland Service? "+
   "Originalfakturaen blir IKKE endret eller sendt på nytt."))return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  try{
   const mismatch=norm(contact.name)!==norm(data.invoice.name);
   if(mismatch&&!window.confirm("Navnet på kundekortet er forskjellig fra "+
    "navnet på originalfakturaen. Har du kontrollert at dette er samme kunde?"))
    return;
   const response=await fetch("/api/admin/invoices/customer-card",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"link",confirmed:true,
     kind:invoiceKind,id:invoiceId,contactId:contact.id,
     nameMismatchConfirmed:mismatch})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)
    throw Error(result.error||"Kundekortet kunne ikke knyttes til fakturaen.");
   const updated=await load();
   setCreating(false);setSavedContact(null);
   setNotice("Kundekortet er koblet til fakturaen i Aadland Service. "+
    (updated.tripletex?.status==="linked"?
     "Kunden er også koblet til Tripletex.":
     "Bruk egen knapp nedenfor for å opprette eller koble kunden i Tripletex."));
  }catch(e){
   setError((e.message||"Kundekortkoblingen feilet.")+
    " Hvis kunden allerede ble opprettet, velg det eksisterende kundekortet ved neste forsøk.");
  }finally{setBusy(false);inFlight.current=false;}
 }
 async function createCustomer(event){
  event.preventDefault();
  if(busy||inFlight.current||data?.truncated)return;
  if(suggestions.length>0&&!similarReviewed){
   setError("Kontroller mulige eksisterende kundekort før du oppretter et nytt.");
   return;
  }
  if(!window.confirm("Opprette kundekort for «"+form.name+"» i Aadland Service? "+
   "Opplysningene skal være kontrollert mot den utstedte fakturaen. "+
   "Ingen ny faktura eller e-post sendes."))return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/admin/customer-contacts",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({...form})
   });
   const payload=await response.json().catch(()=>({}));
   if(!response.ok||!payload.contact?.id)
    throw Error(payload.error||"Kundekortet kunne ikke lagres. Kontroller kunderegisteret før du prøver igjen.");
   setSavedContact(payload.contact);
   if(payload.existing){
    setNotice("Kunden finnes allerede i Aadland Service. "+
     "Kontroller det eksisterende kortet og trykk «Koble kundekortet» nedenfor.");
   }else{
    setNotice("Kundekortet er lagret i Aadland Service. "+
     "Koble det til fakturaen med knappen nedenfor.");
   }
   // Do not issue another create POST if linking later fails.
   await load();
  }catch(e){setError(e.message||"Kunden kunne ikke opprettes.");}
  finally{setBusy(false);inFlight.current=false;}
 }
 async function syncTripletex(){
  const contact=data?.linkedContact;
  if(!contact||busy||inFlight.current||!data?.tripletexConfigured)return;
  const status=data.tripletex?.status||"pending";
  if(!["pending","linked"].includes(status)){
   setError("En tidligere Tripletex-overføring er uavklart. "+
    "Kontroller kunden under Regnskap → Tripletex-overføringer først.");
   return;
  }
  if(!window.confirm((status==="linked"?"Oppdatere":"Opprette eller koble")+
   " kunden «"+contact.name+"» i den tilkoblede Tripletex-kontoen? "+
   "Eksisterende kunder kontrolleres først. Ingen faktura opprettes, "+
   "sendes eller bokføres."))return;
  inFlight.current=true;setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/admin/tripletex/customers",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:status==="linked"?"update":"transfer",
     sourceType:"contact",sourceId:contact.id})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)
    throw Error(result.error||"Tripletex-koblingen er ikke bekreftet.");
   await load();
   setNotice("Kundekortet er "+
    (status==="linked"?"kontrollert/oppdatert":"opprettet eller koblet")+
    " i Tripletex. Den opprinnelige fakturaen er uendret.");
  }catch(e){
   setError((e.message||"Tripletex kunne ikke bekrefte kunden.")+
    " Ikke forsøk en ny opprettelse før du har kontrollert kunden i Tripletex.");
   try{await load();}catch{}
  }finally{setBusy(false);inFlight.current=false;}
 }
 return <>
  <button type="button" onClick={openDialog} disabled={busy} style={{
   padding:"9px 12px",borderRadius:8,whiteSpace:"normal"
  }}>{caption}</button>
  {open&&<div role="presentation" style={{position:"fixed",inset:0,
   zIndex:1200,background:"rgba(13,20,26,.65)",display:"grid",
   placeItems:"center",padding:12}}>
   <div ref={dialogRef} role="dialog" aria-modal="true"
    aria-label="Kundekort for utstedt faktura" tabIndex={-1}
    onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();close();}}}
    style={{background:"#fff",color:"#24221f",borderRadius:14,
     width:"min(100%,650px)",maxHeight:"min(92dvh,880px)",overflowY:"auto",
     padding:"clamp(14px,3vw,24px)",boxShadow:"0 20px 65px rgba(0,0,0,.3)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,
     alignItems:"start"}}>
     <div><h2 style={{margin:"0 0 5px",fontSize:23}}>Kundekort</h2>
      <p style={{fontSize:13,margin:"0 0 14px",color:"#635d52"}}>
       Faktura {data?.invoice?.number||""}
       {data?.invoice?.source?" · "+data.invoice.source:""}</p>
     </div>
     <button type="button" disabled={busy} onClick={close}
      aria-label="Lukk kundekortvindu">Lukk ×</button>
    </div>
    {loading&&<p role="status">Kontrollerer faktura og kunderegister …</p>}
    {error&&<p role="alert" style={{color:"#9d3022"}}>{error}</p>}
    {notice&&<p role="status" style={{color:"#225d42"}}>{notice}</p>}
    {!loading&&data?.invoice&&<>
     <div style={{border:"1px solid #e1d7c8",borderRadius:9,
      padding:12,marginBottom:14,background:"#faf8f4"}}>
      <strong>Hentet fra fakturaopplysningene:</strong>
      <div>{data.invoice.name}</div>
      <small>Andre opplysninger er bare forhåndsutfylt dersom de allerede
       finnes i fakturaens lagrede kundedata. Kontroller alltid PDF-originalen.</small>
     </div>
     {data.linkedContact?<div style={{border:"1px solid #b8caba",
      padding:13,borderRadius:10,display:"grid",gap:8}}>
      <strong>Kundekort koblet i Aadland Service</strong>
      <div>{data.linkedContact.name}
       {data.linkedContact.organization_number?" · Org.nr. "+data.linkedContact.organization_number:""}
       {data.linkedContact.email?" · "+data.linkedContact.email:""}
      </div>
      <Link href={"/admin/kunder/"+encodeURIComponent(data.linkedContact.id)}>
       Åpne og rediger kundekortet
      </Link>
      <p style={{fontSize:13,margin:0}}>
       Tripletex: {data.tripletex?.status==="linked"?
        "Kundekortet er koblet (ID "+data.tripletex.customerId+")":
        data.tripletex?.status==="processing"?"Overføring pågår":
        data.tripletex?.status==="needs_review"?"Overføring krever manuell kontroll":
        !data.tripletexConfigured?"Tripletex er ikke tilkoblet":"Ikke overført"}
      </p>
      {data.tripletexConfigured&&
       ["pending","linked"].includes(data.tripletex?.status||"pending")&&
       <button type="button" disabled={busy} onClick={syncTripletex}
        style={{padding:"11px 13px",fontWeight:700}}>
        {busy?"Kontrollerer Tripletex …":data.tripletex?.status==="linked"?
         "Oppdater kundekortet i Tripletex":
         "Opprett eller koble kunden i Tripletex"}
       </button>}
      {data.tripletex?.status==="needs_review"&&
       <Link href="/admin/regnskap?vis=overforinger">
        Kontroller uavklart Tripletex-overføring
       </Link>}
     </div>:
     <div style={{display:"grid",gap:13}}>
      <p style={{fontSize:13,margin:0}}>
       Velg et eksisterende kundekort, eller åpne skjemaet under.
       Ingen utstedt faktura endres når et kundekort kobles.
      </p>
      {savedContact&&<div style={{border:"1px solid #c5d6c1",borderRadius:8,
       padding:12,display:"grid",gap:6}}>
       <strong>{savedContact.name} – kundekort lagret</strong>
       <p style={{fontSize:12,margin:0}}>
        Kortet er opprettet eller funnet. Ikke opprett det en gang til.
       </p>
       <button type="button" disabled={busy}
        onClick={()=>linkContact(savedContact)}>Koble kundekortet til fakturaen</button>
      </div>}
      <label style={label}>Finn eksisterende kunde
       <input style={entry} type="search" value={filter}
        placeholder="Navn, e-post, telefon eller org.nr."
        onChange={e=>setFilter(e.target.value)} disabled={busy}/>
      </label>
      {data.truncated&&<p role="alert" style={{fontSize:13,color:"#9d3022"}}>
       Kunderegisteret er for langt til komplett kontroll her. Åpne kunderegisteret
       og kontroller eksisterende kunder før en ny opprettes.
      </p>}
      <div style={{maxHeight:195,overflowY:"auto",
       border:"1px solid #e4dfd8",borderRadius:8}}>
       {candidates.slice(0,20).map(c=><div key={c.id}
        style={{padding:9,borderBottom:"1px solid #eee6dd",
         display:"flex",justifyContent:"space-between",gap:9,
         alignItems:"center",flexWrap:"wrap"}}>
        <div><strong>{c.name}</strong>
         <small style={{display:"block"}}>{[
          c.organization_number&&"Org.nr. "+c.organization_number,
          c.email,c.phone].filter(Boolean).join(" · ")||"Bare navn"}
         </small>
        </div>
        <button type="button" disabled={busy} onClick={()=>linkContact(c)}>
         Koble eksisterende
        </button>
       </div>)}
       {!candidates.length&&<p style={{fontSize:13,padding:10,margin:0}}>
        Ingen eksisterende kundekort i søket.</p>}
       {candidates.length>20&&<p style={{fontSize:12,padding:9}}>
        Viser 20 av {candidates.length} treff. Søk mer presist.</p>}
      </div>
      <button type="button" onClick={()=>{setCreating(x=>!x);setError("");}}
       disabled={busy} aria-expanded={creating} style={{padding:"11px 12px",
       borderRadius:8}}>
       {creating?"Skjul nytt kundekort":"＋ Opprett nytt kundekort"}
      </button>
      {creating&&<form onSubmit={createCustomer} style={{display:"grid",gap:12,
       padding:13,border:"1px solid #e3d7c6",borderRadius:9}}>
       <h3 style={{margin:0,fontSize:18}}>Ny kunde</h3>
       <div style={split}>
        <label style={label}>Kundetype
         <select value={form.customerType} disabled={busy} style={entry}
          onChange={e=>change("customerType",e.target.value)}>
          <option value="private">Privatkunde</option>
          <option value="business">Bedrift</option>
         </select>
        </label>
        <label style={label}>Kundenavn fra faktura *
         <input required maxLength={180} style={entry} disabled={busy}
          value={form.name} onChange={e=>{change("name",e.target.value);
           setSimilarReviewed(false);}}/>
        </label>
        {form.customerType==="business"&&<label style={label}>Organisasjonsnummer
         <input maxLength={9} inputMode="numeric" pattern="[0-9]{9}"
          style={entry} disabled={busy} value={form.organizationNumber}
          onChange={e=>{change("organizationNumber",e.target.value);
           setSimilarReviewed(false);}}/>
        </label>}
        {form.customerType==="business"&&<label style={label}>Kontaktperson
         <input maxLength={180} style={entry} disabled={busy}
          value={form.contactPerson} onChange={e=>change("contactPerson",e.target.value)}/>
        </label>}
        <label style={label}>E-post
         <input type="email" maxLength={240} style={entry} disabled={busy}
          value={form.email} onChange={e=>{change("email",e.target.value);
           setSimilarReviewed(false);}}/>
        </label>
        <label style={label}>Telefon
         <input type="tel" maxLength={70} style={entry} disabled={busy}
          value={form.phone} onChange={e=>change("phone",e.target.value)}/>
        </label>
        <label style={label}>Betalingsfrist (dager)
         <input type="number" min={0} max={365} required style={entry}
          disabled={busy} value={form.paymentTermsDays}
          onChange={e=>change("paymentTermsDays",e.target.value)}/>
        </label>
       </div>
       <label style={label}>Adresse, postnummer og poststed
        <textarea maxLength={500} rows={2} style={entry} disabled={busy}
         value={form.address} onChange={e=>change("address",e.target.value)}/>
       </label>
       {suggestions.length>0&&<div style={{background:"#fff1db",padding:10,
        borderRadius:8}}>
        <p style={{margin:"0 0 8px",fontSize:13}}>
         {suggestions.length} mulig eksisterende kundekort med samme navn,
         e-post eller organisasjonsnummer. Velg det fra listen hvis det er
         samme kunde, så du slipper dobbeltregistrering.
        </p>
        <label style={{fontSize:13}}>
         <input type="checkbox" checked={similarReviewed}
          onChange={e=>setSimilarReviewed(e.target.checked)}/>
         Jeg har kontrollert treffene og bekrefter at det er en annen kunde.
        </label>
       </div>}
       <p style={{fontSize:12,margin:0}}>
        Ingen kunde får e-post, innlogging eller ny faktura ved opprettelse.
        Du kan etterpå overføre kundekortet til Tripletex med egen godkjenning.
       </p>
       <button type="submit" disabled={busy||data.truncated||!text(form.name)||
        (suggestions.length>0&&!similarReviewed)}
        style={{padding:"12px 13px",fontWeight:700}}>
        {busy?"Lagrer kundekort …":"Lagre kundekort i Aadland Service"}
       </button>
      </form>}
     </div>}
    </>}
   </div>
  </div>}
 </>;
}
