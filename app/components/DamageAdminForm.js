"use client";
import {useState,useRef} from "react";
import {damageFormPayload} from "../../lib/damageAdminForm.mjs";
import styles from "./damageAdmin.module.css";
const demoRow={groupId:"00000000-0000-4000-8000-000000000101",bookingId:"00000000-0000-4000-8000-000000000102",label:"DEMO-125 · Borhammer",condition:"damage",note:"Skadet feste på demoverktøy.",depositOre:200000,published:false};
const kr=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
export default function DamageAdminForm({demo=true,rows=[]}){
 const options=demo?[demoRow]:rows;
 const [selection,setSelection]=useState(""),[id,setId]=useState(""),[description,setDescription]=useState(""),[amount,setAmount]=useState(""),[photos,setPhotos]=useState([]),[cost,setCost]=useState(null),[review,setReview]=useState(null),[approved,setApproved]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[done,setDone]=useState(false);
 const lock=useRef(false),selected=options.find(x=>x.bookingId===selection);
 const payload=damageFormPayload({id,selected,description,amount,photos:photos.map(x=>x.digest),cost:cost?.digest});
 function reset(value){setSelection(value);setId(crypto.randomUUID());setDescription("");setAmount("");setPhotos([]);setCost(null);setReview(null);setApproved(false);setDone(false);setNotice("");}
 async function upload(file,kind){
  if(!file||!selected||lock.current||review||done||kind==="photo"&&photos.length>=12)return;
  lock.current=true;setBusy(true);setNotice("");
  try{
   if(file.size>3*1024*1024)throw Error("Maks 3 MB per bilde.");
   const data=new FormData();data.append("file",file);
   if(!demo){data.append("groupId",selected.groupId);data.append("bookingId",selected.bookingId);}
   const r=await fetch(demo?"/api/admin/damage/photo-test":"/api/admin/damage/evidence",{method:"POST",body:data,cache:"no-store"}),d=await r.json();
   if(!r.ok||!d.photo?.digest||demo&&d.mode!=="validation_only")throw Error(d.error||"Dokumentet kunne ikke kontrolleres.");
   if(kind==="cost"){if(photos.some(x=>x.digest===d.photo.digest))throw Error("Kostnadsdokument må være et annet bilde enn skadebildet.");setCost(d.photo);}
   else{if(cost?.digest===d.photo.digest)throw Error("Dette bildet er allerede brukt som kostnadsdokument.");setPhotos(x=>x.some(p=>p.digest===d.photo.digest)?x:[...x,d.photo]);}
   setNotice(demo?"Kontrollert. Ikke lagret.":"Dokumentet er lagret privat, men kravet er ikke publisert.");
  }catch(e){setNotice(e.message||"Opplasting mislyktes.");}finally{lock.current=false;setBusy(false);}
 }
 async function publish(){
  if(!review||!approved||lock.current||done)return;
  lock.current=true;setBusy(true);setNotice("");
  try{
   if(!demo){
    const r=await fetch("/api/admin/damage/evidence",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...review,approved:true})});
    const d=await r.json();if(!r.ok||!d.ok||d.id!==review.id)throw Error("Publisering ikke bekreftet. Ikke lag ny sak; prøv samme godkjenning igjen eller kontroller oversikten.");
   }
   setDone(true);setNotice(demo?"Testkrav godkjent i denne visningen. Ikke lagret eller sendt.":"Krav registrert. Varsel er lagt i kø; utsending er ikke bekreftet.");
  }catch(e){setNotice(e.message);}finally{lock.current=false;setBusy(false);}
 }
 return <section className={styles.panel}><header><small>AADLAND UTLEIE</small><h1>Registrer skadesak</h1><p>{demo?"TESTMODUS – kun fiktive krav og ufølsomme testbilder":"Privat saksregistrering – krever eiergodkjenning"}</p></header>
 <label>Velg registrert retur<select value={selection} disabled={busy||!!review||done} onChange={e=>reset(e.target.value)}><option value="">Velg ordre og utstyr</option>{options.map(x=><option key={x.bookingId} value={x.bookingId} disabled={x.published}>{x.label}{x.published?" – krav allerede registrert":""}</option>)}</select></label>
 {!options.length&&<p>Ingen registrerte skader klare til behandling.</p>}
 {selected&&<><div className={styles.card}><h2>1. Skade og kostnad</h2><p>{selected.note}</p><p>Avtalt depositum: {kr(selected.depositOre)}</p><label>Beskrivelse<textarea value={description} maxLength={2000} disabled={busy||!!review||done} onChange={e=>setDescription(e.target.value)} placeholder="Beskriv skade, årsak og dokumentert kostnad."/></label><label>Dokumentert krav (kr)<input inputMode="decimal" value={amount} placeholder="0,00" disabled={busy||!!review||done} onChange={e=>setAmount(e.target.value)}/></label></div>
 <div className={styles.card}><h2>2. Dokumentasjon</h2><p>JPG, PNG eller WebP, maks 3 MB per fil. Kostnadsdokument må være et bilde av dokumentasjonen. PDF støttes ikke ennå.</p><label>Skadebilder ({photos.length}/12)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!!review||done||photos.length>=12} onChange={e=>{const f=e.target.files?.[0];e.target.value="";upload(f,"photo");}}/></label>{photos.map((p,i)=><div className={styles.line} key={p.digest}><span>Bilde {i+1} kontrollert</span><button disabled={busy||!!review||done} onClick={()=>setPhotos(x=>x.filter(y=>y.digest!==p.digest))}>Fjern fra krav</button></div>)}<label>Kostnadsdokument<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!!review||done} onChange={e=>{const f=e.target.files?.[0];e.target.value="";upload(f,"cost");}}/></label>{cost&&<div className={styles.line}><span>Kostnadsdokument kontrollert</span><button disabled={busy||!!review||done} onClick={()=>setCost(null)}>Fjern fra krav</button></div>}</div>
 {!review&&<button className={styles.primary} disabled={busy||!payload||done} onClick={()=>{setReview(payload);setApproved(false);setNotice("");}}>Kontroller kravet</button>}
 {review&&<div className={styles.card}><h2>3. Kontroll og godkjenning</h2><p>{selected.label}</p><p>{review.description}</p><p><strong>Krav: {kr(review.amount_ore)}</strong></p><p>{review.photo_digests.length} skadebilder + kostnadsdokument</p>{review.amount_ore>selected.depositOre&&<p>Kravet overstiger depositumet. Eventuelt restkrav må behandles separat.</p>}<p>Publisering er ikke et depositumstrekk eller en faktura. Kunden kan godta eller bestride kravet.</p><label className={styles.check}><input type="checkbox" checked={approved} disabled={busy||done} onChange={e=>setApproved(e.target.checked)}/>Jeg har kontrollert dokumentasjon, beløp og riktig ordre.</label><div className={styles.line}><button disabled={busy||done} onClick={()=>{setReview(null);setApproved(false);}}>Tilbake og rediger</button><button className={styles.primary} disabled={busy||!approved||done} onClick={publish}>{done?"Godkjent":demo?"Godkjenn testkrav":"Godkjenn og publiser"}</button></div></div>}
 </>}
 <p role="status" aria-live="polite">{busy?"Behandler dokumentasjon …":notice}</p>{done&&<button onClick={()=>reset("")}>Ny registrering</button>}</section>;
}
