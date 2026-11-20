"use client";
import {useEffect,useState} from "react";
const kr=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
const box={padding:12,border:"1px solid #d7c8aa",borderRadius:10,marginTop:10,
 background:"#f9f7f2",display:"grid",gap:12};
const input={width:"100%",maxWidth:410};
const label={display:"grid",gap:4,fontSize:13,fontWeight:700};
const buttons={padding:"10px 14px",borderRadius:9,fontWeight:700};
export default function ExternalInvoiceTripletexPanel({invoice,onChanged}){
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [record,setRecord]=useState(null),[error,setError]=useState("");
 const [info,setInfo]=useState("");
 const [vatRate,setVatRate]=useState("25"),[base,setBase]=useState("");
 const [number,setNumber]=useState("90000000");
 const [customerStatus,setCustomerStatus]=useState("loading");
 const [confirmed,setConfirmed]=useState(false);
 const [notImported,setNotImported]=useState(false);
 const [customerConfirmed,setCustomerConfirmed]=useState(false);
 const url="/api/admin/invoices/external-register/tripletex";
 const refresh=async()=>{
  const r=await fetch(url+"?id="+encodeURIComponent(invoice.id),{cache:"no-store"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok)throw Error(d.error||"Kan ikke hente status fra Tripletex.");
  setRecord(d.import||null);
  setCustomerStatus(d.customerStatus||"missing_local_card");
 };
 useEffect(()=>{
  let live=true;setLoading(true);setError("");
  fetch(url+"?id="+encodeURIComponent(invoice.id),{cache:"no-store"})
   .then(async r=>{
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok)throw Error(d.error||"Overføringsstatus kunne ikke hentes.");
    if(live){setRecord(d.import||null);
     setCustomerStatus(d.customerStatus||"missing_local_card");
     if(!d.import&&Number.isSafeInteger(Number(d.suggestedImportNumber)))
      setNumber(String(d.suggestedImportNumber));}
   }).catch(e=>{if(live)setError(e.message)})
   .finally(()=>{if(live)setLoading(false)});
  return()=>{live=false};
 },[invoice.id]);
 const paid=invoice.status==="paid";
 async function prepare(){
  if(busy||record)return;
  if(!window.confirm("Klargjøre ekte fakturaimport til Tripletex for "+
   invoice.invoice_number+"? Kontroller MVA og kunden mot den opprinnelige "+
   "fakturaen. Det opprettes IKKE et nytt bilag i Tripletex før du selv "+
   "importerer CSV-filen. Importerte fakturaer skal IKKE sendes til kunden på nytt."))return;
  setBusy(true);setError("");setInfo("");
  try{
   const r=await fetch(url,{method:"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({
     action:"prepare",id:invoice.id,vatRate,baseAmount:base,importNumber:number,
     paymentTypeImportId:"",
     vatConfirmed:confirmed,notImportedConfirmed:notImported,
     correctCustomerConfirmed:customerConfirmed
    })});
   const d=await r.json().catch(()=>({}));
   if(!r.ok||!d.ok)throw Error(d.error||"Klargjøringen er uavklart.");
   await refresh();
   setInfo("CSV-filen er klar. Den er ennå IKKE importert i Tripletex.");
  }catch(e){setError(e.message||"Klargjøringen feilet.");}
  finally{setBusy(false);}
 }
 async function verify(){
  if(busy||record?.status!=="prepared")return;
  if(!window.confirm("Har du lastet opp CSV-filen i Tripletex, og kontrollert "+
   "at fakturaen faktisk er importert med riktig kunde, dato, MVA og beløp? "+
   "Jeg kontrollerer fakturanummer, dato, beløp og kundenummer mot Tripletex før statusen endres."))return;
  setBusy(true);setInfo("");setError("");
  try{
   const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"verify-import",id:invoice.id,confirmed:true})});
   const d=await r.json().catch(()=>({}));
   if(!r.ok||!d.ok)throw Error(d.error||"Importen ble ikke bekreftet.");
   await refresh();onChanged?.();
   setInfo("Importen er bekreftet mot fakturaoversikten i Tripletex. PDF-originalen er fortsatt lagret privat hos Aadland Service.");
  }catch(e){setError(e.message||"Tripletex kunne ikke bekrefte fakturaen.");}
  finally{setBusy(false);}
 }
 return <section style={box}>
  <h3 style={{fontSize:17,margin:0}}>Tripletex – ekstern faktura {invoice.invoice_number}</h3>
  <p style={{fontSize:13,margin:0}}>
   Originalen er allerede utstedt i {invoice.source_system}. I Tripletex
   importerer du dette som en <strong>allerede utstedt kundefaktura</strong>,
   ikke som et nytt salg til kunden. Du må bevare original-PDF separat og
   kontrollere at fakturaen ikke finnes i Tripletex fra før.</p>
  {loading&&<p>Henter overføringsstatus …</p>}
  {error&&<p role="alert" style={{color:"#a43a2b"}}>{error}</p>}
  {info&&<p role="status">{info}</p>}
  {!loading&&!record&&<>
   <div style={{display:"grid",gap:8,border:"1px solid #d7c8aa",
    background:"#fff",padding:11,borderRadius:9}}>
    <strong>Kundekort i Tripletex</strong>
    <p style={{fontSize:13,margin:0}}>
     {customerStatus==="linked_to_tripletex"?
      "Kunden er koblet til Tripletex. Importfilen bruker det bekreftede kundenummeret.":
      customerStatus==="missing_local_card"?
      "Først må du trykke «Kundekort – velg eller opprett» på fakturaen, og knytte riktig kunde.":
      customerStatus==="needs_review"?
      "Kundeoverføringen er uavklart. Kontroller den i Tripletex før du fortsetter.":
      "Kundekortet finnes på nettsiden, men må opprettes eller kobles i Tripletex før import."}
    </p>
    <button type="button" onClick={async()=>{
     setBusy(true);setError("");
     try{await refresh();}catch(e){setError(e.message)}
     finally{setBusy(false);}
    }} disabled={busy}>Oppdater kundekobling</button>
   </div>
   <p style={{fontSize:13,margin:0}}>
    <strong>Oppgi eksakt avgiftsgrunnlag fra PDF-en.</strong> Automatisk
    MVA-gjetting er ikke tillatt. Denne enkle importen støtter fakturaer med
    kun én avgiftssats (12, 15 eller 25 %). Andre fakturaer må gjennomgås
    særskilt i Tripletex.</p>
   <div style={{display:"grid",gap:10,
    gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,190px),1fr))"}}>
    <label style={label}>MVA-sats på hele fakturaen
     <select value={vatRate} onChange={e=>{setVatRate(e.target.value);setConfirmed(false);}}>
      <option value="25">25 %</option><option value="15">15 %</option>
      <option value="12">12 %</option>
     </select>
    </label>
    <label style={label}>Eksakt beløp eks. MVA (kr)
     <input style={input} inputMode="decimal" value={base}
      placeholder="F.eks. 1000,00" onChange={e=>{setBase(e.target.value);setConfirmed(false);}}/>
    </label>
    <label style={label}>Ledig Tripletex-importnummer
     <input style={input} inputMode="numeric" value={number}
      onChange={e=>{setNumber(e.target.value);setNotImported(false);}}/>
    </label>
    
   </div>
   <p style={{fontSize:13,margin:0}}>
    Fakturabeløp fra originalen: <strong>{kr(Number(invoice.amount_ore))}</strong>.
    {paid?" Fakturaen er merket betalt på nettsiden, men CSV-importen vil opprette den som UBETALT i Tripletex. Registrer faktisk betaling med korrekt opprinnelig bankdato etterpå, én gang.":""}
   </p>
   <label><input type="checkbox" checked={confirmed}
    onChange={e=>setConfirmed(e.target.checked)}/>
    Jeg har kontrollert MVA-sats og beløp mot originalfakturaen.</label>
   <label><input type="checkbox" checked={customerConfirmed}
    onChange={e=>setCustomerConfirmed(e.target.checked)}/>
    Jeg har kontrollert at kundekortet er koblet til riktig kunde i Tripletex.</label>
   <label><input type="checkbox" checked={notImported}
    onChange={e=>setNotImported(e.target.checked)}/>
    Fakturaen er ikke allerede importert eller bokført i Tripletex.</label>
   <button type="button" disabled={busy||!confirmed||!customerConfirmed||
    !notImported||!base||!number||customerStatus!=="linked_to_tripletex"} onClick={prepare}
    style={buttons}>{busy?"Kontrollerer …":"Klargjør Tripletex-import"}</button>
  </>}
  {record&&<>
   <p style={{margin:0}}>
    <strong>Tripletex-importnummer: {record.importNumber}</strong>
    {" · "}{record.status==="prepared"?"Klargjort – IKKE importert":
     record.status==="confirmed"?"Bekreftet importert":"Må kontrolleres"}
   </p>
   <p style={{fontSize:13,margin:0}}>
    Kontrollert grunnlag {kr(Number(record.baseOre))} + MVA
    {" "}{kr(Number(record.vatOre))} = {kr(Number(invoice.amount_ore))}.
   </p>
   {record.status==="prepared"&&<>
    <a href={url+"?id="+encodeURIComponent(invoice.id)+"&format=csv"}
     download style={{fontWeight:700}}>
     Last ned Tripletex-importfil (CSV)
    </a>
    <p style={{fontSize:13,margin:0}}>
     Gå deretter til <strong>Tripletex → Faktura → Import/eksport →
     Fakturaimport</strong>. Velg CSV, last opp filen og velg
     <strong> ikke</strong> «Beløp inkl. MVA». Tripletex viser importen
     i Fakturaoversikt etter gjennomføring.
    </p>
    <p style={{fontSize:13,margin:0}}>
     PDF-originalen er fortsatt lagret på denne nettsiden. Importfilen
     inneholder fakturadata, ikke PDF-en; originalfilen kan lastes ned her
     og vedlegges i Tripletex ved behov.
    </p>
    <button type="button" disabled={busy} onClick={verify} style={buttons}>
     {busy?"Kontrollerer Tripletex …":"Kontroller og bekreft importen i Tripletex"}
    </button>
   </>}
   {record.status==="confirmed"&&<p role="status">
    Fakturaen er funnet med riktig nummer, dato og beløp i Tripletex.
    Kundetilknytningen er bekreftet på riktig Tripletex-kunde. Betalingspostering,
    faktisk dato og bankavstemming må fortsatt kontrolleres separat.
   </p>}
  </>}
 </section>;
}
