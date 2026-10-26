"use client";
import {useEffect,useState} from "react";
import {vatReportingAdvice} from "../../../../lib/vatReportingControl";
const labels=["Januar–februar","Mars–april","Mai–juni","Juli–august","September–oktober","November–desember"];
const names={not_filed:"Ikke levert (bekreftet av deg)",preparing:"Under arbeid",filed:"Levert (bekreftet av deg)"};
export default function VatReportingControlClient({year,term,onChanged,onSelectTerm}){
 const [result,setResult]=useState(null);
 const [registrationDate,setRegistrationDate]=useState("");
 const [confirmedDate,setConfirmedDate]=useState(false);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 const [state,setState]=useState("unverified");
 const [filedOn,setFiledOn]=useState("");
 const [reference,setReference]=useState("");
 const [notes,setNotes]=useState("");
 const [confirmedStatus,setConfirmedStatus]=useState(false);
 const refresh=()=>onChanged?.();
 useEffect(()=>{
  let active=true;setLoading(true);setError("");setSuccess("");
  fetch("/api/admin/invoices/vat-reporting-control?year="+encodeURIComponent(year),{cache:"no-store"})
   .then(async response=>{const body=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(body.error||"Kunne ikke hente MVA-status.");
    if(active){
     setResult(body);setRegistrationDate(body.profile?.registration_date||body.suggestion?.observed_date||"");
     setConfirmedDate(false);
    }
   }).catch(e=>{if(active){setResult(null);setError(e.message||"Ukjent feil");}})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false;};
 },[year]);
 const active=result?.terms?.find(row=>row.term===Number(term))||null;
 useEffect(()=>{
  setState(active?.status||"unverified");
  setFiledOn(active?.filed_on||"");
  setReference(active?.submission_reference||"");
  setNotes(active?.notes||"");
  setConfirmedStatus(false);setSuccess("");
 },[active?.updated_at,year,term]);
 const advice=vatReportingAdvice(result?.profile||null,year,term);
 async function saveProfile(event){
  event.preventDefault();if(saving)return;
  setSaving(true);setError("");setSuccess("");
  try{
   const response=await fetch("/api/admin/invoices/vat-reporting-control",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"registration",registrationDate,confirmed:confirmedDate})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"Kunne ikke lagre registreringen.");
   setResult(old=>({...old,profile:data.profile}));
   setConfirmedDate(false);
   setSuccess("Datoen er lagret som din manuelle opplysning. Den er ikke kontrollert hos Skatteetaten.");
   refresh();
  }catch(e){setError(e.message);}
  finally{setSaving(false);}
 }
 async function saveStatus(event){
  event.preventDefault();if(saving||state==="unverified")return;
  if(!window.confirm("Lagre den manuelle statusen for "+term+". termin "+year+
   "?\nDette sender IKKE en MVA-melding til Skatteetaten."))return;
  setSaving(true);setError("");setSuccess("");
  try{
   const response=await fetch("/api/admin/invoices/vat-reporting-control",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"status",year:Number(year),term:Number(term),
     status:state,filedOn,submissionReference:reference,notes,confirmed:confirmedStatus})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"Kunne ikke lagre terminstatus.");
   setResult(old=>({...old,terms:[...old.terms.filter(row=>row.term!==Number(term)),data.term]
    .sort((a,b)=>a.term-b.term)}));
   setConfirmedStatus(false);setSuccess("Din status er lagret. Skatteetaten er ikke kontaktet.");
   refresh();
  }catch(e){setError(e.message);}
  finally{setSaving(false);}
 }
 return <section className="card" style={{padding:18,marginBottom:18}} id="mva-innsending">
  <h2>Registrering og oversikt over MVA-meldinger</h2>
  <p style={{fontSize:13}}>Her kan du holde oversikt over hvilke terminer du har levert.
   Statusene er <strong>bare dine egne notater</strong> og blir ikke hentet fra eller sendt til Skatteetaten.</p>
  {loading&&<p role="status">Henter terminhistorikk …</p>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  {result&&!loading&&<>
   <form onSubmit={saveProfile} style={{background:"#f1f5f2",padding:14,borderRadius:10,marginBottom:15}}>
    <h3 style={{margin:"0 0 8px"}}>Dato for MVA-registrering</h3>
    {result.suggestion&&!result.profile&&<p style={{fontSize:13,background:"#fff3df",padding:12,borderRadius:9}}>
     <strong>Foreløpig dato lagt inn: {result.suggestion.observed_date}.</strong>
     {" "}5. juni 2026 er datoen da MVA-statusen ble endret i offentlig historikk.
     Det er ikke nødvendigvis juridisk virkningsdato.
     {" "}<a href={result.suggestion.source_url} target="_blank" rel="noopener noreferrer">
      Se endringshistorikken</a>.
     Datoen er forhåndsutfylt, men ikke bekreftet eller brukt til endelig MVA-oppgjør.
    </p>}
    <p style={{fontSize:13}}>Fyll inn datoen som står i bekreftelsen fra Skatteetaten
     (ikke datoen du sendte søknaden). Det avgjør hva som er første ordinære MVA-termin.</p>
    <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"end"}}>
     <label>Bekreftet virkningsdato
      <input type="date" required value={registrationDate} onChange={e=>{
       setRegistrationDate(e.target.value);setConfirmedDate(false);}}/>
     </label>
     <label style={{fontSize:13}}>
      <input type="checkbox" checked={confirmedDate} onChange={e=>setConfirmedDate(e.target.checked)}/>
      Jeg har kontrollert datoen hos Skatteetaten
     </label>
     <button type="submit" disabled={saving||!confirmedDate||!registrationDate}>Lagre registreringsdato</button>
    </div>
    {result.profile&&<p style={{fontSize:13,marginBottom:0}}>Oppgitt første ordinære termin:
     <strong> {result.profile.first_term}. termin {result.profile.first_term_year}</strong>.
     Skatteetaten må fortsatt bekrefte at denne perioden stemmer.</p>}
   </form>
   <p style={{background:advice.kind==="normal"?"#f0f5ee":"#fff1d9",
    borderRadius:9,padding:12,fontSize:13}}>
    <strong>{advice.kind==="before_registration"?"Kontroller før-registreringskjøp: ":
     advice.kind==="unknown"?"Registrering ikke avklart: ":"Registreringsperiode: "}</strong>
    {advice.text}
   </p>
   <h3>MVA-terminer i {year}</h3>
   <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",minWidth:360}}>
     <thead><tr><th>Termin</th><th>Din registrerte status</th><th>Åpne</th></tr></thead>
     <tbody>{labels.map((label,index)=>{
      const t=index+1,record=result.terms.find(row=>row.term===t);
      return <tr key={t}><td>{t}. {label}</td>
       <td>{record?names[record.status]:"Ikke kontrollert"}</td>
       <td><button type="button" disabled={saving} onClick={()=>onSelectTerm?.(t)}>
        {Number(term)===t?"Vises":"Se termin"}</button></td></tr>;
     })}</tbody>
    </table>
   </div>
   <form onSubmit={saveStatus} style={{borderTop:"1px solid #ddd",marginTop:16,paddingTop:14}}>
    <h3>Din innsendingsstatus for {term}. termin {year}</h3>
    <label>Status
     <select value={state} onChange={e=>{setState(e.target.value);setConfirmedStatus(false);}}>
      <option value="unverified">Ikke kontrollert</option>
      <option value="not_filed">Ikke levert (bekreftet av meg)</option>
      <option value="preparing">Under arbeid</option>
      <option value="filed">Levert hos Skatteetaten (bekreftet av meg)</option>
     </select>
    </label>
    {state==="filed"&&<div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:10}}>
     <label>Faktisk innsendingsdato
      <input type="date" required value={filedOn} onChange={e=>setFiledOn(e.target.value)}/>
     </label>
     <label>Innsendingsreferanse (valgfritt)
      <input maxLength={160} value={reference} onChange={e=>setReference(e.target.value)}
       placeholder="Fra kvitteringen hos Skatteetaten"/>
     </label>
    </div>}
    <label style={{display:"block",marginTop:10}}>Eget notat (valgfritt)
     <textarea rows={2} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}
      placeholder="F.eks. mangler kontroll av et kjøpsbilag."/>
    </label>
    <label style={{display:"block",fontSize:13,marginTop:10}}>
     <input type="checkbox" checked={confirmedStatus} onChange={e=>setConfirmedStatus(e.target.checked)}/>
     Jeg har kontrollert statusen. Jeg forstår at denne knappen ikke leverer MVA-melding.
    </label>
    <button type="submit" disabled={saving||state==="unverified"||!confirmedStatus||
     (state==="filed"&&!filedOn)}>Lagre min terminstatus</button>
   </form>
  </>}
  {success&&<p role="status" style={{color:"#26594a"}}>{success}</p>}
  <p style={{fontSize:13,marginTop:16}}>For å se hva som faktisk er sendt, logg inn
   hos <a href="https://www.skatteetaten.no/bedrift-og-organisasjon/avgifter/mva/mva-melding/"
   target="_blank" rel="noopener noreferrer">Skatteetaten og åpne MVA-meldingene dine</a>.</p>
 </section>;
}
