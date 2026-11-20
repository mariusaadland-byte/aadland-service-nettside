"use client";
import {useEffect,useRef,useState} from "react";
import {readExternalInvoiceAmountFromOriginal} from "../../../../lib/externalInvoiceDocumentReader";
import {parseExternalInvoiceOre} from "../../../../lib/externalInvoiceRegister";
import {splitExternalInvoiceGrossByRate} from "../../../../lib/externalInvoiceVatMath";
const kr=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
const box={padding:"clamp(14px,2.5vw,22px)",border:"2px solid #9baebd",borderRadius:12,marginTop:10,
 background:"#fff",color:"#192b3b",display:"grid",gap:14};
const input={width:"100%",maxWidth:410,minHeight:44,fontSize:16,fontWeight:750,
 padding:"10px 12px",color:"#192b3b",background:"#fff",
 border:"1.5px solid #71869a",borderRadius:8};
const label={display:"grid",gap:6,fontSize:15,fontWeight:750,color:"#192b3b"};
const buttons={padding:"11px 14px",borderRadius:9,fontWeight:750,
 fontSize:15,minHeight:44,background:"#e9f1f8",color:"#18374f",
 border:"1.5px solid #7892a6"};
export default function ExternalInvoiceTripletexPanel({invoice,onChanged}){
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [record,setRecord]=useState(null),[error,setError]=useState("");
 const [info,setInfo]=useState("");
 const [vatRate,setVatRate]=useState(""),[base,setBase]=useState("");
 const [readerStatus,setReaderStatus]=useState("idle");
 const [readerMessage,setReaderMessage]=useState("");
 const [readerSource,setReaderSource]=useState("");
 const [detectedVatOre,setDetectedVatOre]=useState(null);
 const readerAbort=useRef(null);
 const userChanged=useRef(false);
 const [number,setNumber]=useState("90000000");
 const [customerStatus,setCustomerStatus]=useState("loading");
 const [confirmed,setConfirmed]=useState(false);
 const [notImported,setNotImported]=useState(false);
 const [customerConfirmed,setCustomerConfirmed]=useState(false);
 const [direct,setDirect]=useState(null);
 const [directLoading,setDirectLoading]=useState(true);
 const [paymentTypeId,setPaymentTypeId]=useState("");
 const [paymentSourceConfirmed,setPaymentSourceConfirmed]=useState(false);
 const url="/api/admin/invoices/external-register/tripletex";
 const directUrl=url+"/direct";
 const refreshDirect=async()=>{
  const response=await fetch(directUrl+"?id="+encodeURIComponent(invoice.id),{cache:"no-store"});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw Error(result.error||"Direkte Tripletex-overføring kunne ikke kontrolleres.");
  setDirect(result);
  return result;
 };
 const refresh=async()=>{
  const r=await fetch(url+"?id="+encodeURIComponent(invoice.id),{cache:"no-store"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok)throw Error(d.error||"Kan ikke hente status fra Tripletex.");
  setRecord(d.import||null);
  setCustomerStatus(d.customerStatus||"missing_local_card");
  await refreshDirect();
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
 const enteredBaseOre=parseExternalInvoiceOre(base);
 const computedVatOre=enteredBaseOre!==null&&[12,15,25].includes(Number(vatRate))?
  Math.round(enteredBaseOre*Number(vatRate)/100):null;
 const importAmountsMatch=computedVatOre!==null&&
  enteredBaseOre+computedVatOre===Number(invoice.amount_ore);
 async function readOriginalAmount({manualRetry=false}={}){
  readerAbort.current?.abort();
  const controller=new AbortController();
  readerAbort.current=controller;
  if(manualRetry){userChanged.current=false;setConfirmed(false);}
  setReaderStatus("reading");setReaderMessage("Åpner originalfakturaen …");
  setReaderSource("");setDetectedVatOre(null);
  try{
   const suggestion=await readExternalInvoiceAmountFromOriginal({
    id:invoice.id,invoiceNumber:invoice.invoice_number,
    amountOre:Number(invoice.amount_ore)
   },message=>{
    if(!controller.signal.aborted)setReaderMessage(message);
   },controller.signal);
   if(controller.signal.aborted)return;
   if(suggestion.ok){
    if(!userChanged.current){
     setBase(suggestion.baseAmount);
     setVatRate(String(suggestion.vatRate));
     setReaderStatus("found");
     setReaderSource(suggestion.method);
     setDetectedVatOre(suggestion.vatOre);
     setReaderMessage("Beløp ekskl. MVA og avgift er hentet fra originalfakturaen. Kontroller begge beløpene før import.");
    }else{
     setReaderStatus("manual");
     setReaderMessage("Du har endret tallene selv. Den automatiske lesingen overskrev dem ikke.");
    }
   }else{
    setReaderStatus("manual");
    setReaderMessage(suggestion.reason||"Kunne ikke lese MVA-beløpene sikkert. Kontroller fakturaen.");
   }
  }catch(error){
   if(!controller.signal.aborted){
    setReaderStatus("manual");
    setReaderMessage(error.message||"Originalfakturaen kunne ikke leses. Kontroller MVA-grunnlaget manuelt.");
   }
  }finally{
   if(readerAbort.current===controller)readerAbort.current=null;
  }
 }
 function manualAmountChange(kind,value){
  userChanged.current=true;
  setConfirmed(false);
  setReaderSource("");setDetectedVatOre(null);
  if(kind==="rate"){
   setVatRate(value);
   if(!value){
    setBase("");setReaderStatus("manual");
    setReaderMessage("Velg en MVA-sats for å beregne fra totalbeløpet.");
   }else{
    // The owner has explicitly chosen the VAT rate. Use the gross amount
    // already recorded on the invoice to calculate net immediately.
    calculateFromStoredTotal(value);
   }
  }else{
   setReaderStatus("manual");
   setBase(value);
   setReaderMessage("Beløp ekskl. MVA er redigert manuelt. Kontroller mot originalfakturaen.");
  }
 }
 function calculateFromStoredTotal(selectedRate=vatRate){
  const rate=Number(selectedRate),total=Number(invoice.amount_ore);
  const calculated=splitExternalInvoiceGrossByRate(total,rate);
  if(!calculated){
   setReaderStatus("manual");
   setBase("");
   setReaderMessage("Totalbeløpet kan ikke fordeles nøyaktig på valgt MVA-sats. Kontroller manuelt.");
   return;
  }
  const net=calculated.baseOre,tax=calculated.vatOre;
  userChanged.current=true;
  setBase((net/100).toFixed(2).replace(".",","));
  setDetectedVatOre(tax);setReaderSource("");
  setReaderStatus("calculated");setConfirmed(false);
  setReaderMessage("Beregnet automatisk etter at du valgte "+rate+" % MVA: "+
   (net/100).toFixed(2).replace(".",",")+" kr ekskl. MVA + "+
   (tax/100).toFixed(2).replace(".",",")+" kr MVA = "+
   (total/100).toFixed(2).replace(".",",")+" kr inkl. MVA. "+
   "Dette er beregnet fra totalsummen, ikke lest fra PDF-en. Kontroller mot originalfakturaen.");
 }
 useEffect(()=>{
  userChanged.current=false;
  void readOriginalAmount();
  return()=>readerAbort.current?.abort();
 },[invoice.id]);
 useEffect(()=>{
  let live=true;
  setDirectLoading(true);
  fetch(directUrl+"?id="+encodeURIComponent(invoice.id),{cache:"no-store"})
   .then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw Error(data.error||"Betalingsmåtene kunne ikke leses.");
    if(live)setDirect(data);
   }).catch(e=>{if(live)setError(e.message)})
   .finally(()=>{if(live)setDirectLoading(false)});
  return()=>{live=false};
 },[invoice.id]);
 async function transferDirect(){
  if(busy||record||directLoading||direct?.importExists||
   !importAmountsMatch||customerStatus!=="linked_to_tripletex")return;
  const selectedType=paid?Number(paymentTypeId):null;
  if(paid&&(!selectedType||!paymentSourceConfirmed)){
   setError("Velg riktig betalingsmåte i Tripletex og bekreft at innbetalingen ikke allerede er bokført.");
   return;
  }
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Oslo"});
  if(paid&&(!invoice.paid_on||invoice.paid_on>today)){
   setError("Den lagrede betalingsdatoen er ikke gyldig. Rett betalingsdatoen i Aadland Service før overføring.");
   return;
  }
  const approved=window.confirm(
   "Du er i ferd med å BOKFØRE en ekstern faktura i Tripletex, ikke bare klargjøre CSV. "+
   "Opprinnelig faktura "+invoice.invoice_number+" – "+invoice.customer_name+
   ", "+kr(Number(invoice.amount_ore))+".\n\n"+
   (paid?"Den lagrede innbetalingen på "+kr(Number(invoice.amount_ore))+
    " blir også bokført automatisk på dato "+invoice.paid_on+
    " med betalingsmåten du har valgt.\n\n":"Fakturaen registreres som ubetalt.\n\n")+
   "Tripletex gir fakturaen et NYTT internt fakturanummer. Originalnummeret beholdes som referanse. "+
   "Den sendes IKKE til kunden.\n\n"+
   "Har du kontrollert at den ikke allerede er bokført, og at MVA og betalingsmåte er riktig?"
  );
  if(!approved)return;
  setBusy(true);setError("");setInfo("");
  try{
   const response=await fetch(directUrl,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     action:"transfer-direct",id:invoice.id,confirmed:true,
     notBookedElsewhere:notImported,verifiedPaymentSource:paid?paymentSourceConfirmed:true,
     paymentTypeId:selectedType,vatRate,baseAmount:base,importNumber:number,
     vatConfirmed:confirmed,notImportedConfirmed:notImported,
     correctCustomerConfirmed:customerConfirmed
    })
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||
    "Resultatet av overføringen er uavklart. Kontroller Tripletex før nytt forsøk.");
   setInfo("Overført til Tripletex – faktura "+result.tripletexInvoiceNumber+
    (result.paymentStatus==="confirmed"?
     ", med automatisk registrert betaling "+result.paidOn:"")+
    ". Ingen faktura er sendt på nytt til kunden.");
   await refresh();
   onChanged?.();
  }catch(e){
   setError(e.message||"Overføringen kunne ikke bekreftes. Sjekk Tripletex før du prøver igjen.");
   try{await refresh();}catch{}
  }finally{setBusy(false);}
 }
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
 return <section className="externalTripletexPanel" style={box}>
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
    <strong>MVA-grunnlag fra originalfakturaen.</strong> PDF-leseren fyller inn
    sats og beløp når den finner et entydig grunnlag som stemmer med totalsummen.
    Denne enkle importen støtter fakturaer med
    kun én avgiftssats (12, 15 eller 25 %). Andre fakturaer må gjennomgås
    særskilt i Tripletex.</p>
   <div style={{display:"grid",gap:10,
    gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,190px),1fr))"}}>
    <label style={label}>MVA-sats på hele fakturaen
     <select value={vatRate} onChange={e=>manualAmountChange("rate",e.target.value)}>
      <option value="">Velg MVA-sats</option>
      <option value="25">25 %</option><option value="15">15 %</option>
      <option value="12">12 %</option>
     </select>
    </label>
    <label style={label}>Eksakt beløp eks. MVA (kr)
     <input style={input} inputMode="decimal" value={base}
      placeholder="Hentes automatisk fra PDF" onChange={e=>manualAmountChange("base",e.target.value)}/>
    </label>
    <label style={label}>MVA-beløp (kr) – beregnet
     <input style={{...input,background:"#f6f4ef"}} readOnly
      aria-label="MVA-beløp beregnet" value={computedVatOre===null?"":(computedVatOre/100).toFixed(2).replace(".",",")}
      placeholder="Vises etter MVA-sats og netto"/>
    </label>
    <label style={label}>Beløp inkl. MVA (kr) – beregnet
     <input style={{...input,background:"#f6f4ef",fontWeight:700}} readOnly
      aria-label="Beløp inkl. MVA beregnet" value={computedVatOre===null?"":((enteredBaseOre+computedVatOre)/100).toFixed(2).replace(".",",")}
      placeholder="Vises automatisk"/>
    </label>
    <label style={label}>Fakturasum inkl. MVA på originalen (kr)
     <input style={{...input,background:"#f6f4ef"}} readOnly
      aria-label="Fakturasum inkl. MVA fra originalfakturaen"
      value={(Number(invoice.amount_ore)/100).toFixed(2).replace(".",",")}/>
    </label>
    <label style={label}>Ledig Tripletex-importnummer
     <input style={input} inputMode="numeric" value={number}
      onChange={e=>{setNumber(e.target.value);setNotImported(false);}}/>
    </label>
    
   </div>
   <div style={{display:"grid",gap:8,padding:10,border:"1px solid #d6dfd5",
    borderRadius:9,background:"#fff"}}>
    <strong>Automatisk lesing av originalfakturaen</strong>
    <p role="status" style={{fontSize:13,margin:0}}>
     {readerStatus==="reading"?"Leser dokumentet: ":""}{readerMessage||
      "Leseren starter når overføringen åpnes."}
    </p>
    {readerStatus==="found"&&<p style={{fontSize:13,margin:0}}>
     Hentet fra {readerSource}: ekskl. MVA {kr(enteredBaseOre||0)},
     MVA {kr(detectedVatOre||0)}, total {kr(Number(invoice.amount_ore))}.
    </p>}
    <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
     <button type="button" disabled={busy||readerStatus==="reading"}
      onClick={()=>readOriginalAmount({manualRetry:true})}>
      Les originalfakturaen på nytt
     </button>
     <button type="button" disabled={busy||readerStatus==="reading"||
      ![12,15,25].includes(Number(vatRate))}
      onClick={()=>calculateFromStoredTotal()}>
      Beregn fra total og valgt MVA-sats
     </button>
    </div>
    {enteredBaseOre!==null&&computedVatOre!==null&&<p style={{fontSize:13,
     margin:0,color:importAmountsMatch?"#246346":"#9b3428"}}>
     {kr(enteredBaseOre)} ekskl. MVA + {kr(computedVatOre)} MVA =
     {" "}{kr(enteredBaseOre+computedVatOre)}.
     {importAmountsMatch?" ✓ Beregnet inkl. MVA stemmer med originalfakturaen.":
      " ⚠ Beregnet inkl. MVA stemmer IKKE med originalfakturaen. Tripletex-importen er sperret til tallene er rettet."}
    </p>}
    <small>Beløpet må fortsatt bekreftes mot originalfakturaen.
     Ingen MVA eller faktura bokføres automatisk.</small>
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
   <div style={{border:"2px solid #2b5474",borderRadius:10,padding:14,
    background:"#f0f6fc",display:"grid",gap:11}}>
    <strong style={{fontSize:18}}>Direkte overføring til Tripletex</strong>
    <p style={{fontSize:14,margin:0}}>Opprett fakturaen direkte i Tripletex uten CSV.
     Originalfakturaen sendes ikke til kunden igjen. Tripletex tildeler eget
     fakturanummer, og det gamle nummeret lagres som referanse.</p>
    {paid&&<>
     <div style={{padding:11,border:"1px solid #9aabba",borderRadius:8,
      background:"#fff",display:"grid",gap:6}}>
      <strong>Betaling hentes automatisk fra Aadland Service</strong>
      <div>Registrert betalingsdato: <strong>{invoice.paid_on||"Mangler"}</strong></div>
      <div>Registrert innbetaling: <strong>{kr(Number(invoice.amount_ore))}</strong></div>
      <small>Dato og beløp kan ikke overstyres her. Hvis de er feil,
       må du korrigere registreringen på nettsiden før overføring.</small>
     </div>
     <label style={label}>Betalingsmåte / riktig bankkonto i Tripletex
      <select value={paymentTypeId}
       onChange={e=>{setPaymentTypeId(e.target.value);setPaymentSourceConfirmed(false);}}
       disabled={busy||directLoading}>
       <option value="">Velg betalingsmåte i Tripletex</option>
       {(direct?.paymentTypes||[]).map(type=>
        <option key={type.id} value={String(type.id)}>
         {type.name}{type.account?" · konto "+type.account:""}
        </option>)}
      </select>
     </label>
     {direct?.paymentTypesError&&<p role="alert" style={{color:"#9b3027",margin:0}}>
      {direct.paymentTypesError}</p>}
     <label style={{display:"flex",gap:9,alignItems:"start"}}>
      <input type="checkbox" checked={paymentSourceConfirmed}
       onChange={e=>setPaymentSourceConfirmed(e.target.checked)}/>
      Jeg har kontrollert at denne betalingen faktisk er mottatt på riktig
      konto, og at den ikke allerede er bokført eller matchet i Tripletex.
     </label>
    </>}
    {directLoading&&<p role="status">Kontrollerer betalingstyper i Tripletex …</p>}
    {direct?.configured===false&&<p role="alert">
     Koble til Tripletex-produksjon før automatisk overføring.</p>}
    <button type="button" className="externalTripletexPrimaryButton"
     style={buttons}
     disabled={busy||directLoading||!direct?.configured||
      !confirmed||!customerConfirmed||!notImported||!importAmountsMatch||
      !number||customerStatus!=="linked_to_tripletex"||readerStatus==="reading"||
      (paid&&(!invoice.paid_on||!paymentTypeId||!paymentSourceConfirmed))}
     onClick={transferDirect}>
     {busy?"Overfører og kontrollerer …":
      paid?"Overfør faktura + registrer lagret betaling automatisk":
      "Overfør faktura automatisk til Tripletex"}
    </button>
    <small>Dette oppretter fakturaen i regnskapet og registrerer eventuell
     eksisterende innbetaling med historisk dato. En uavklart API-respons
     sperrer ny automatisk overføring for å forhindre dobbeltføring.</small>
   </div>
   <details style={{border:"1px solid #a4b4c2",borderRadius:9,padding:12}}>
    <summary style={{cursor:"pointer",fontWeight:700}}>Alternativ: manuell CSV-import</summary>
    <p style={{fontSize:13}}>Bruk dette bare hvis du vil beholde den manuelle
     Tripletex-fakturaimporten. Betaling med original dato blir ikke automatisk
     bokført via CSV.</p>
    <button type="button" disabled={busy||!confirmed||!customerConfirmed||
     !notImported||!importAmountsMatch||!number||
     customerStatus!=="linked_to_tripletex"||readerStatus==="reading"} onClick={prepare}
     style={buttons}>{busy?"Kontrollerer …":"Klargjør CSV-import"}</button>
   </details>
  </>}
  {record&&<>
   <p style={{margin:0}}>
    <strong>{record.transferMethod==="api"?
     "Tripletex fakturanummer: "+(record.tripletexInvoiceNumber||"under kontroll"):
     "Tripletex-importnummer: "+record.importNumber}</strong>
    {" · "}{record.status==="prepared"?"CSV klargjort – IKKE importert":
     record.status==="confirmed"?"Bekreftet registrert i Tripletex":
     record.status==="processing"?"Overføring pågår – ikke send på nytt":
     "Må kontrolleres i Tripletex – ikke send på nytt"}
   </p>
   <p style={{fontSize:13,margin:0}}>
    Kontrollert grunnlag {kr(Number(record.baseOre))} + MVA
    {" "}{kr(Number(record.vatOre))} = {kr(Number(invoice.amount_ore))}.
   </p>
   {record.transferMethod==="api"&&<p role="status" style={{
    padding:12,border:"1px solid #bdcdd8",borderRadius:8,
    background:"#f2f6fa"}}>
    {record.paymentStatus==="confirmed"?
      "Betalingen er registrert i Tripletex med dato "+record.paymentDate+" og fullt beløp.":
     record.paymentStatus==="not_applicable"?
      "Denne fakturaen ble registrert som ubetalt i Tripletex.":
      "Betalingen er ikke bekreftet i Tripletex og må kontrolleres manuelt. Ikke registrer den på nytt før du har kontrollert hovedbok og bank."}
   </p>}
   {record.transferMethod!=="api"&&record.status==="prepared"&&<>
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
    <button type="button" className="externalTripletexPrimaryButton" disabled={busy} onClick={verify} style={buttons}>
     {busy?"Kontrollerer Tripletex …":"Kontroller og bekreft importen i Tripletex"}
    </button>
   </>}
   {record.status==="confirmed"&&record.transferMethod!=="api"&&<p role="status">
    CSV-fakturaen er funnet med riktig dato, beløp og kunde i Tripletex.
    Betaling med original dato er ikke registrert automatisk for CSV-import.
   </p>}
  </>}
 </section>;
}
