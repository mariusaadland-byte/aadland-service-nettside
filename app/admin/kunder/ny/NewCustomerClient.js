"use client";
import {useState} from "react";
import Link from "next/link";

const initial={name:"",email:"",phone:"",address:"",paymentTermsDays:14};
const labelStyle={display:"grid",gap:5,margin:"8px 0"};
export default function NewCustomerClient({invoiceId=""}){
 const [form,setForm]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const back=invoiceId?"/admin/faktura?id="+encodeURIComponent(invoiceId):"/admin";
 const set=(key,value)=>setForm(prev=>({...prev,[key]:value}));
 async function submit(e){
  e.preventDefault();if(busy)return;setBusy(true);setError("");
  try{
   const res=await fetch("/api/admin/customer-contacts",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)
   });
   const data=await res.json().catch(()=>({});
   if(!res.ok)throw Error(data.error||"Kunden kunne ikke lagres.");
   if(!data.contact?.id)throw Error("Kundekortet ble ikke bekreftet lagret.");
   const target=invoiceId?"/admin/faktura?id="+encodeURIComponent(invoiceId)+"&customerId="+encodeURIComponent(data.contact.id):"/admin/kunder/"+encodeURIComponent(data.contact.id);
   window.location.assign(target);
  }catch(e){setError(e.message||"Kunden kunne ikke opprettes.");}
  finally{setBusy(false);}
 }
 return <main className="admin" style={{maxWidth:820,margin:"auto",padding:"24px clamp(14px,3vw,30px)"}}>
  <Link href={back}>← {invoiceId?"Tilbake til fakturakladden":"Tilbake til admin"}</Link>
  <div className="kicker" style={{marginTop:22}}>KUNDEREGISTER</div>
  <h1>Registrer ny kunde</h1>
  <p className="muted">Opprett kundekort én gang og bruk det på alle senere fakturaer og tilbud. {invoiceId?"Etter lagring kommer du tilbake til fakturaen, og kunden velges automatisk.":""}</p>
  <form className="card" onSubmit={submit} style={{padding:"clamp(16px,3vw,28px)",display:"grid",gap:14}}>
   <fieldset disabled={busy} style={{border:0,padding:0,minWidth:0,display:"grid",gap:13}}>
    <section>
     <h2>1. Kundeopplysninger</h2>
     <label style={labelStyle}>Kundenavn / firmanavn *<input required autoFocus maxLength={180} value={form.name} onChange={e=>set("name",e.target.value)} autoComplete="name" placeholder="Navn på kunden"/></label>
     <label style={labelStyle}>Adresse, postnummer og poststed<textarea rows={3} maxLength={500} value={form.address} onChange={e=>set("address",e.target.value)} autoComplete="street-address" placeholder="Gateadresse\nPostnummer og poststed"/></label>
    </section>
    <section>
     <h2>2. Kontaktinformasjon</h2>
     <label style={labelStyle}>E-postadresse til faktura<input type="email" maxLength={240} value={form.email} onChange={e=>set("email",e.target.value)} autoComplete="email" placeholder="kunde@eksempel.no"/></label>
     <label style={labelStyle}>Mobilnummer / telefon<input type="tel" maxLength={70} value={form.phone} onChange={e=>set("phone",e.target.value)} autoComplete="tel" placeholder="8 sifre"/></label>
    </section>
    <section>
     <h2>3. Fakturainnstillinger</h2>
     <label style={labelStyle}>Standard betalingsfrist (dager)<input type="number" min={0} max={365} step={1} required value={form.paymentTermsDays} onChange={e=>set("paymentTermsDays",e.target.value)}/></label>
     <p className="muted" style={{fontSize:13}}>Når du bruker kunden på en ny faktura, fylles navn, adresse, kontaktopplysninger og betalingsfrist inn automatisk. Du kan overstyre forfallsdato for en enkelt faktura.</p>
    </section>
    <p style={{fontSize:13,margin:0}}>Du kan endre disse opplysningene senere på kundekortet. Opprettelse av kundekort sender ingen e-post eller faktura til kunden.</p>
    {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
    <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
     <button type="submit" disabled={busy}>{busy?"Lagrer kunde …":invoiceId?"Lagre kunden og bruk på faktura":"Lagre nytt kundekort"}</button>
     <Link href={back}>Avbryt</Link>
    </div>
   </fieldset>
  </form>
 </main>;
}
