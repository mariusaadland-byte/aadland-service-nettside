"use client";
import {useEffect,useRef,useState} from "react";
import VatOriginalAttachment from "./VatOriginalAttachment";
import VatReceiptScanner from "./VatReceiptScanner";
import styles from "./VatSimpleForm.module.css";
import {vatDocumentPeriod} from "../../../../lib/vatDocumentPeriod";
import {emptyVatOcrSuggestion,snapshotVatOcrSuggestion,mergeVatReceiptSuggestions,startNewVatReceiptDraft} from "../../../../lib/vatReceiptAutofill";
import {vatReceiptAttachmentIssue,validateVatReceiptAttachmentBytes,removeVatReceiptAttachmentReference} from "../../../../lib/vatReceiptAttachmentReadiness";
import {updateVatReceiptReviewedField,updateVatReceiptReviewedAmount} from "../../../../lib/vatReceiptReview";
import {parseVatGrossInput,vatSplitFromGross} from "../../../../lib/vatReceiptGrossCalculator";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(n)||0)/100);
const blank=()=>({0:{base:"",vat:""},12:{base:"",vat:""},15:{base:"",vat:""},25:{base:"",vat:""}});
const parse=value=>{
 if(!/^\d+(?:[,.]\d{1,2})?$/.test(String(value||"").trim()))return null;
 const [whole,decimals=""]=String(value).replace(",",".").split(".");
 return Number(whole)*100+Number(decimals.padEnd(2,"0"));
};
const moneyInput=ore=>(ore/100).toFixed(2).replace(".",",");
const rates=[0,12,15,25];
const purposeChoices=["Materialer til kundeoppdrag","Verktøy og utstyr","Driftskostnad","Transport i virksomheten"];
export default function InputVatRegisterClient({purchases,period,onChanged}){
 const [form,setForm]=useState({
  supplierName:"",documentNumber:"",documentDate:"",kind:"purchase",
  originalDocumentNumber:"",evidenceReference:"",businessPurpose:"",
  deductionPercent:"100",groups:blank(),documentConfirmed:false,
  deductionConfirmed:false,bankConditionConfirmed:false
 });
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const [receiptFile,setReceiptFile]=useState(null);
 const [receiptPreviewUrl,setReceiptPreviewUrl]=useState("");
 const [receiptIsCopy,setReceiptIsCopy]=useState(false);
 const [ocrGrossOre,setOcrGrossOre]=useState(null);
 const [grossInput,setGrossInput]=useState("");
 const [vatRateChoice,setVatRateChoice]=useState("");
 const grossManuallyEdited=useRef(false);
 const rateManuallyChosen=useRef(false);
 const grossCalculated=useRef(false);
 const manualVatRates=useRef(new Set());
 const [ocrMismatchChecked,setOcrMismatchChecked]=useState(false);
 const [scanBusy,setScanBusy]=useState(false);
 const [receiptSession,setReceiptSession]=useState(0);
 const [showMoreRates,setShowMoreRates]=useState(false);
 const [customPurpose,setCustomPurpose]=useState(false);
 const [attachmentIssue,setAttachmentIssue]=useState(null);
 useEffect(()=>{
  if(!receiptFile?.type?.startsWith("image/")){
   setReceiptPreviewUrl("");return;
  }
  const url=URL.createObjectURL(receiptFile);
  setReceiptPreviewUrl(url);
  return()=>URL.revokeObjectURL(url);
 },[receiptFile]);
 const previousOcr=useRef(emptyVatOcrSuggestion());
 const submittingRef=useRef(false);
 const documentPeriod=vatDocumentPeriod(form.documentDate);
 const chooseReceipt=(file,meta={})=>{
  setReceiptFile(file||null);setReceiptIsCopy(Boolean(file&&meta.converted));setAttachmentIssue(null);setError("");setSuccess("");
  setOcrGrossOre(null);setOcrMismatchChecked(false);
  if(!file){
   setGrossInput("");setVatRateChoice("");
   grossManuallyEdited.current=false;rateManuallyChosen.current=false;grossCalculated.current=false;
   manualVatRates.current.clear();
   // A valid new receipt starts a new accounting draft. Never carry a
   // manually corrected amount, supplier, VAT rate or purpose to this one.
   // This is NOT called on a crop or OCR retry of the same receipt.
   previousOcr.current=emptyVatOcrSuggestion();
   setForm(x=>startNewVatReceiptDraft(x));
   setShowMoreRates(false);
   setCustomPurpose(false);
   return;
  } // OCR retry/initial attachment must not erase work on the same receipt.
  setForm(x=>({...x,
   evidenceReference:x.evidenceReference||(
    meta.converted?"Aadland MVA – vedlagt JPEG-kopi, original beholdes eksternt":"Aadland MVA – privat originalvedlegg"),
   documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false}));
 };
 const receiveScan=result=>{
  grossCalculated.current=false;
  manualVatRates.current.clear();
  setOcrGrossOre(Number.isSafeInteger(result.totalOre)?result.totalOre:null);
  if(!grossManuallyEdited.current)
   setGrossInput(Number.isSafeInteger(result.totalOre)?moneyInput(result.totalOre):"");
  if(!rateManuallyChosen.current){
   const detected=Object.keys(result.groups||{});
   setVatRateChoice(detected.length===1?detected[0]:"");
  }
  setOcrMismatchChecked(false);
  // Preserve manual corrections; withdraw outdated OCR values when a crop
  // changes the recognized receipt. Never carry an old OCR date forward.
  const previous=previousOcr.current;
  previousOcr.current=snapshotVatOcrSuggestion(result);
  // A new OCR result can change amounts or the date. Require the user to
  // re-confirm the receipt after reviewing the updated suggestions.
  setForm(x=>({...mergeVatReceiptSuggestions(x,previous,result),
   documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false}));
 };
 const attachToDocument=async(id,file)=>{
  const payload=new FormData();payload.append("documentId",id);payload.append("file",file);
  const response=await fetch("/api/admin/invoices/vat-attachments",{method:"POST",body:payload});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"Originalbilaget kunne ikke lagres.");
  return data;
 };
 const retryAttachment=async()=>{
  if(!attachmentIssue||busy)return;
  setBusy(true);setError("");
  try{
   await attachToDocument(attachmentIssue.documentId,attachmentIssue.file);
   setAttachmentIssue(null);
   setSuccess("Originalbilaget er nå lagret privat og knyttet til bilaget.");
   onChanged?.({documentDate:attachmentIssue.documentDate});
  }catch(e){setError("Originalbilaget er fortsatt ikke lagret: "+(e.message||"ukjent feil"));}
  finally{setBusy(false);}
 };
 const set=(name,value)=>{
  if(!["documentConfirmed","deductionConfirmed","bankConditionConfirmed"].includes(name))setOcrMismatchChecked(false);
  setForm(x=>updateVatReceiptReviewedField(x,name,value));
 };
 const setGroup=(rate,key,value)=>{
  grossCalculated.current=false;
  if(key==="vat")manualVatRates.current.add(rate);
  setOcrMismatchChecked(false);
  setForm(x=>{
   const next=updateVatReceiptReviewedAmount(x,rate,key,value);
   // When the user fills net amount, compute the matching tax immediately.
   // A VAT amount the user explicitly corrected must never be overwritten.
   if(key!=="base"||manualVatRates.current.has(rate))return next;
   const baseOre=parse(value);
   return baseOre!==null&&baseOre>0
    ?updateVatReceiptReviewedAmount(next,rate,"vat",moneyInput(Math.round(baseOre*rate/100))):next;
  });
 };
 const calculateFromGross=(rateValue=vatRateChoice,onlyIfEmpty=false)=>{
  const total=parseVatGrossInput(grossInput),rate=Number(rateValue);
  const pair=vatSplitFromGross(total,rate);
  if(!pair){if(!onlyIfEmpty)setError("Oppgi en gyldig sum inkl. MVA og velg satsen fra kvitteringen.");return;}
  const hasAmounts=Object.values(form.groups).some(g=>g.base||g.vat);
  if(onlyIfEmpty&&hasAmounts&&!grossCalculated.current)return;
  if(hasAmounts&&!onlyIfEmpty&&!grossCalculated.current&&!window.confirm("Dette erstatter MVA-beløp du allerede har fylt inn. Er du sikker?"))return;
  setForm(x=>({...x,groups:{...blank(),[rate]:pair},
   documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false}));
  grossCalculated.current=true;
  manualVatRates.current.clear();
  setOcrMismatchChecked(false);setError("");
 };
 let netTotal=0,vatTotal=0,valid=true;
 for(const rate of rates){
  const line=form.groups[rate],n=parse(line.base),v=parse(line.vat);
  if(line.base||line.vat){
   if(n===null||v===null||n<=0||Math.abs(v-Math.round(n*rate/100))>5)valid=false;
   else {netTotal+=n;vatTotal+=v;}
  }
 }
 const otherRateHasValue=rates.filter(rate=>rate!==25).some(rate=>Boolean(form.groups[rate]?.base||form.groups[rate]?.vat));
 const visibleRates=(showMoreRates||otherRateHasValue)?[25,15,12,0]:[25];
 const selectedPurpose=purposeChoices.includes(form.businessPurpose)?form.businessPurpose:(customPurpose||form.businessPurpose?"custom":"");
 const percent=Number(form.deductionPercent);
 const deductible=Math.round(vatTotal*percent/100);
 const ocrGrossMismatch=ocrGrossOre!==null&&netTotal>0&&Math.abs(ocrGrossOre-(netTotal+vatTotal))>5;
 const receiptUploadIssue=vatReceiptAttachmentIssue(receiptFile,form.evidenceReference);
 const editedGrossOre=grossManuallyEdited.current&&grossInput.trim()?parseVatGrossInput(grossInput):null;
 const editedGrossMismatch=Boolean(grossManuallyEdited.current&&grossInput.trim()&&
  (editedGrossOre===null||netTotal>0&&Math.abs(editedGrossOre-(netTotal+vatTotal))>5));
 const submit=async e=>{
  e.preventDefault();
  if(submittingRef.current||busy)return;
  setError("");setSuccess("");
  if(attachmentIssue){
   setError("Forrige bilag er registrert, men originalvedlegget mangler. Bruk opplastingsknappen for det bilaget før du oppretter et nytt.");
   return;
  }
  if(scanBusy){setError("Kvitteringen leses fortsatt. Vent til lesingen er ferdig.");return;}
  if(receiptUploadIssue){setError(receiptUploadIssue);return;}
  if(!valid||netTotal<=0){setError("Kontroller grunnlag og MVA på hver sats (avrundingsavvik maks 0,05 kr).");return;}
  if(editedGrossMismatch){setError("Sum inkl. MVA stemmer ikke med feltene. Trykk Beregn fra totalsum eller rett beløpene.");return;}
  if(ocrGrossMismatch&&!ocrMismatchChecked){setError("OCR-summen stemmer ikke med beløpene. Kontroller kvitteringen og bekreft avviket før registrering.");return;}
  // Reserve the submission synchronously; otherwise a double-tap can submit
  // twice while Safari is reading the file header asynchronously.
  submittingRef.current=true;
  setBusy(true);
  try{
   const actualFileIssue=await validateVatReceiptAttachmentBytes(receiptFile,form.evidenceReference);
   if(actualFileIssue){setError(actualFileIssue);return;}
   const question="Registrere et kontrollert leverandørbilag i intern MVA-avstemming?\n\n"+
   form.supplierName+" – "+form.documentNumber+"\nDokumentdato: "+form.documentDate+
   "\n"+(form.kind==="credit"?"Kreditnota":"Kjøpsfaktura")+
   "\nBrutto beløp: "+money(netTotal+vatTotal)+
   "\nFradragsandel: "+percent+" %\nFradragsberettiget inngående MVA: "+
   money(deductible)+"\n\nOriginalbilaget må fortsatt bevares i regnskapssystemet.";
   if(!window.confirm(question))return;
   const response=await fetch("/api/admin/invoices/vat-purchases",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({...form,action:"register"})
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"Bilaget kunne ikke lagres.");
   const documentId=data.document?.id;
   let attachmentSaved=!receiptFile;
   if(receiptFile&&documentId){
    try{
     await attachToDocument(documentId,receiptFile);
     attachmentSaved=true;
     setAttachmentIssue(null);
    }catch(attachmentError){
     setAttachmentIssue({documentId,file:receiptFile,documentDate:form.documentDate,message:attachmentError.message||"Ukjent feil"});
    }
   }
   setSuccess(attachmentSaved
    ?receiptFile?(receiptIsCopy?"Bilaget og en JPEG-kopi er lagret privat. Behold originalfilen i regnskapet.":"Bilaget og originalkvitteringen er lagret privat.")+" MVA-oversikten oppdateres.":"Bilaget er registrert. MVA-oversikten oppdateres."
    :"Bilaget er registrert, men originalfilen er IKKE lagret. Bruk knappen nedenfor for å prøve igjen.");
   setReceiptFile(null);setReceiptIsCopy(false);setOcrGrossOre(null);setOcrMismatchChecked(false);
   setGrossInput("");setVatRateChoice("");
   grossManuallyEdited.current=false;rateManuallyChosen.current=false;grossCalculated.current=false;
   manualVatRates.current.clear();
   previousOcr.current=emptyVatOcrSuggestion();
   setForm(x=>({...x,supplierName:"",documentNumber:"",documentDate:"",originalDocumentNumber:"",
    evidenceReference:"",businessPurpose:"",kind:"purchase",deductionPercent:"100",groups:blank(),
    documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false}));
   setShowMoreRates(false);setCustomPurpose(false);
   setReceiptSession(n=>n+1);
   // A failed upload must keep the retry control and selected original visible.
   if(attachmentSaved)onChanged?.({documentDate:data.document?.document_date||form.documentDate});
  }catch(e){setError(e.message||"Registreringen mislyktes.");}
  finally{submittingRef.current=false;setBusy(false);}
 };
 const voidDoc=async doc=>{
  if(busy||doc.voided_at)return;
  const reason=window.prompt("Hvorfor skal bilaget oppheves? (minst 8 tegn). Originalen bevares i historikken.");
  if(!reason||reason.trim().length<8)return;
  if(!window.confirm("Oppheve bilag "+doc.documentNumber+"? Det blir ikke regnet med i MVA-avstemmingen lenger. Dette sletter ikke originalbilaget."))return;
  setBusy(true);setError("");setSuccess("");
  try{
   const response=await fetch("/api/admin/invoices/vat-purchases",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"void",id:doc.id,reason,confirmed:true})
   });
   const data=await response.json();
   if(!response.ok)throw Error(data.error||"Bilaget kunne ikke oppheves.");
   setSuccess("Bilaget er opphevet og MVA-oversikten oppdateres.");
   onChanged();
  }catch(e){setError(e.message||"Kunne ikke oppheve bilaget.");}
  finally{setBusy(false);}
 };
 return <section className={styles.registerShell}>
  <div className={styles.header}>
   <h2>Legg til kjøpsbilag</h2>
   <p className={styles.intro}>Ta et bilde eller velg en kvittering. Kontroller opplysningene før du registrerer.</p>
  </div>
  <VatReceiptScanner onSelected={chooseReceipt} onExtracted={receiveScan}
   onBusyChange={setScanBusy} resetToken={receiptSession} disabled={busy||Boolean(attachmentIssue)}/>
  {receiptFile&&receiptPreviewUrl&&<details className={styles.receiptImagePreview}>
   <summary>Vis kvitteringsbildet og kontroller dato/beløp</summary>
   <img src={receiptPreviewUrl} alt="Kvitteringen du har valgt som originalbilag"/>
   <p>Bildet vises bare her mens du kontrollerer opplysningene.</p>
  </details>}
  {receiptFile&&<div className={styles.scanMessage}>
   <strong>{receiptIsCopy?"JPEG-kopi valgt":"Valgt fil"}:</strong> {receiptFile.name}
   {receiptIsCopy&&". Behold originalen i regnskapssystemet."}
   <button className={styles.textAction} type="button" disabled={busy||scanBusy}
    onClick={()=>{
     setReceiptFile(null);setReceiptIsCopy(false);setOcrGrossOre(null);setOcrMismatchChecked(false);
     if(!grossManuallyEdited.current)setGrossInput("");
     if(!rateManuallyChosen.current)setVatRateChoice("");
     setForm(x=>removeVatReceiptAttachmentReference(x));
     setReceiptSession(n=>n+1);
    }}>Fjern vedlegg</button>
  </div>}
  {receiptUploadIssue&&<p role="alert" className={styles.notice}>{receiptUploadIssue}</p>}
  <form onSubmit={submit} className={styles.form}>
   <section className={styles.section}>
    <h3 className={styles.groupTitle}>2. Opplysninger</h3>
    <div className={styles.fieldGrid}>
     <label>Leverandør
      <input required maxLength={160} autoComplete="organization" value={form.supplierName} onChange={e=>set("supplierName",e.target.value)} placeholder="For eksempel Megaflis"/>
     </label>
     <label>Bilagsnummer
      <input required maxLength={90} value={form.documentNumber} onChange={e=>set("documentNumber",e.target.value)} placeholder="Fra kvitteringen"/>
     </label>
     <label>Dokumentdato
      <input type="date" required value={form.documentDate} onChange={e=>set("documentDate",e.target.value)}/>
     </label>
     <label>Bilagstype
      <select value={form.kind} onChange={e=>set("kind",e.target.value)}>
       <option value="purchase">Kjøpsfaktura / kvittering</option>
       <option value="credit">Kreditnota fra leverandør</option>
      </select>
     </label>
     {form.kind==="credit"&&<label className={styles.fullWidth}>Gjelder fakturanummer
      <input required value={form.originalDocumentNumber} onChange={e=>set("originalDocumentNumber",e.target.value)}/>
     </label>}
    </div>
    {documentPeriod&&<div className={styles.termHint}>
     <strong>{documentPeriod.title} · {documentPeriod.months}</strong>
     {period.year!==documentPeriod.year||period.term!==documentPeriod.term?" · Annen termin enn den som vises.":""}
     {" · "}
     <details><summary>Om termin og korrigering</summary>
      <p>Bilaget plasseres i terminen for dokumentdatoen. Terminen åpnes ved registrering. Er MVA-meldingen allerede levert, må eventuell korrigering håndteres separat.</p>
     </details>
    </div>}
   </section>
   <section className={styles.section}>
    <fieldset className={styles.noBorderFieldset}>
     <legend>3. Beløp og MVA</legend>
     <p className={styles.intro} style={{marginBottom:12}}>Når OCR finner totalsummen og en tydelig MVA-sats, beregnes eks. MVA og MVA automatisk. Ellers kan du gjøre det her.</p>
     <div className={styles.grossCalculator}>
      <label>Sum inkl. MVA (kr)
       <input inputMode="decimal" placeholder="For eksempel 1 051,65" value={grossInput}
        onChange={e=>{
         const raw=e.target.value;
         setGrossInput(raw);grossManuallyEdited.current=true;
         setOcrMismatchChecked(false);
         const anyAmounts=Object.values(form.groups).some(g=>g.base||g.vat);
         const autoFill=Boolean(vatRateChoice)&&(grossCalculated.current||!anyAmounts);
         const pair=autoFill?vatSplitFromGross(parseVatGrossInput(raw),vatRateChoice):null;
         if(pair){grossCalculated.current=true;manualVatRates.current.clear();}
         setForm(x=>({...x,...(pair?{groups:{...blank(),[Number(vatRateChoice)]:pair}}:{}),
          documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false}));
        }}/>
      </label>
      <label>MVA-sats på kvitteringen
       <select value={vatRateChoice} onChange={e=>{
        const rate=e.target.value;
        setVatRateChoice(rate);rateManuallyChosen.current=true;
        if(rate)calculateFromGross(rate,true);
       }}>
        <option value="">Velg sats</option>
        <option value="25">25 %</option>
        <option value="15">15 %</option>
        <option value="12">12 %</option>
        <option value="0">0 %</option>
       </select>
      </label>
      <button className={styles.grossCalcButton} type="button"
       disabled={!vatRateChoice||!vatSplitFromGross(parseVatGrossInput(grossInput),Number(vatRateChoice))}
       onClick={()=>calculateFromGross()}>
       Beregn eks. MVA og MVA
      </button>
     </div>
     <p className={styles.grossHelp}>Velg satsen som faktisk står på kvitteringen. Beløpene regnes ut automatisk. Har kjøpet flere satser, fyll inn hver sats separat nedenfor. Du kan også skrive eks. MVA direkte for å beregne MVA.</p>
     {visibleRates.map(rate=><div key={rate} className={styles.rateRow}>
      <div className={styles.rateHead}>
       <strong>{rate} % MVA</strong>
       <button type="button" className={styles.textAction} onClick={()=>{
        const n=parse(form.groups[rate].base);
        if(n===null)return;
        setGroup(rate,"vat",moneyInput(Math.round(n*rate/100)));
       }}>Beregn {rate} %</button>
      </div>
      <div className={styles.rateInputs}>
       <label>Eks. MVA (kr)
        <input inputMode="decimal" placeholder="0,00" value={form.groups[rate].base}
         onChange={e=>setGroup(rate,"base",e.target.value)}/>
       </label>
       <label>MVA (kr)
        <input inputMode="decimal" placeholder="0,00" value={form.groups[rate].vat}
         onChange={e=>setGroup(rate,"vat",e.target.value)}/>
       </label>
      </div>
     </div>)}
     {!otherRateHasValue&&<button className={styles.textAction} type="button" aria-expanded={showMoreRates} onClick={()=>setShowMoreRates(x=>!x)}>
      {showMoreRates?"Vis bare 25 %":"＋ Flere MVA-satser (0, 12 og 15 %)"}
     </button>}
     <div className={styles.amountSummary}>
      <span>Sum inkl. MVA</span>
      <strong>{money(netTotal+vatTotal)}</strong>
     </div>
     <div className={styles.secondarySummary}><span>Eks. MVA {money(netTotal)}</span><span>MVA {money(vatTotal)}</span></div>
     {!valid&&<p role="alert" className={styles.notice}>MVA og grunnlag stemmer ikke med satsen eller beløpet er ugyldig.</p>}
     {editedGrossMismatch&&<p role="alert" className={styles.notice}>Sum inkl. MVA stemmer ikke med MVA-feltene. Bruk Beregn eller kontroller alle satsene.</p>}
     {ocrGrossOre!==null&&<p className={styles.notice} style={{marginTop:10}}>Gjenkjent sum fra kvitteringen: <strong>{money(ocrGrossOre)}</strong>.</p>}
     {ocrGrossMismatch&&<label role="alert" className={styles.checkLabel} style={{background:"#fff4e9",padding:11,borderRadius:9,marginTop:10}}>
      <input type="checkbox" checked={ocrMismatchChecked} onChange={e=>setOcrMismatchChecked(e.target.checked)}/>
      <span><strong>Summen avviker.</strong> OCR fant {money(ocrGrossOre)}, mens feltene viser {money(netTotal+vatTotal)}. Jeg har kontrollert originalen og vil bruke beløpene jeg har oppgitt.</span>
     </label>}
    </fieldset>
   </section>
   <section className={styles.section}>
    <h3 className={styles.groupTitle}>4. Hva gjelder kjøpet?</h3>
    <div className={styles.fieldGrid}>
     <label className={styles.fullWidth}>Bruksområde i virksomheten
      <select value={selectedPurpose} required onChange={e=>{
       const value=e.target.value;
       setCustomPurpose(value==="custom");
       set("businessPurpose",value==="custom"?"":value);
      }}>
       <option value="">Velg hva kjøpet gjelder</option>
       {purposeChoices.map(choice=><option key={choice} value={choice}>{choice}</option>)}
       <option value="custom">Annet – beskriv selv</option>
      </select>
     </label>
     {selectedPurpose==="custom"&&<label className={styles.fullWidth}>Beskrivelse av kjøpet
      <textarea required rows={2} maxLength={500} placeholder="Beskriv hva kjøpet gjelder"
       value={form.businessPurpose} onChange={e=>set("businessPurpose",e.target.value)}/>
     </label>}
     <label className={styles.fullWidth}>Hvor er originalbilaget lagret?
      <input required maxLength={260} placeholder="Referanse i regnskapssystemet"
       value={form.evidenceReference} onChange={e=>set("evidenceReference",e.target.value)}/>
     </label>
     <div className={styles.fullWidth}>
      <div className={styles.deductionRow}>
       <span>Fradragsberettiget MVA</span>
       <label>Andel (%)
        <input type="number" min="0" max="100" step="1" required value={form.deductionPercent}
         onChange={e=>set("deductionPercent",e.target.value)}/>
       </label>
      </div>
      <p className={styles.secondarySummary}>Forslag til fradrag: <strong>{money(deductible)}</strong>{form.kind==="credit"&&" trekkes fra inngående MVA"}</p>
     </div>
    </div>
   </section>
   <section>
    <h3 className={styles.groupTitle}>5. Kontroller og lagre</h3>
    <div className={styles.confirmations}>
     <label className={styles.checkLabel}><input type="checkbox" checked={form.documentConfirmed}
      onChange={e=>set("documentConfirmed",e.target.checked)}/>
      <span>Jeg har kontrollert bilaget og har originaldokumentasjonen tilgjengelig i regnskapet.</span>
     </label>
     <label className={styles.checkLabel}><input type="checkbox" checked={form.deductionConfirmed}
      onChange={e=>set("deductionConfirmed",e.target.checked)}/>
      <span>Jeg har kontrollert fradragsretten og fradragsandelen.</span>
     </label>
     {form.kind==="purchase"&&netTotal+vatTotal>=1000000&&<label className={styles.checkLabel}>
      <input type="checkbox" checked={form.bankConditionConfirmed} onChange={e=>set("bankConditionConfirmed",e.target.checked)}/>
      <span>Jeg har kontrollert bankbetalingskravet for kjøp på minst 10 000 kr inkl. MVA. Hvis fakturaen ikke er betalt ennå, skal den senere betales via bank eller godkjent betalingsformidler.</span>
     </label>}
    </div>
    <button className={styles.submit} type="submit" disabled={busy||scanBusy||Boolean(attachmentIssue)||Boolean(receiptUploadIssue)||editedGrossMismatch||(ocrGrossMismatch&&!ocrMismatchChecked)||!valid||netTotal<=0||!form.documentConfirmed||!form.deductionConfirmed||
     (form.kind==="purchase"&&netTotal+vatTotal>=1000000&&!form.bankConditionConfirmed)}>
     {busy?"Lagrer …":"Registrer kontrollert bilag"}
    </button>
   </section>
  </form>
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  {success&&<p role="status">{success}</p>}
  {attachmentIssue&&<section role="alert" style={{background:"#fff1e9",border:"1px solid #df9f80",padding:13,borderRadius:10}}>
   <strong>Originalbilaget mangler.</strong>
   <p>Registreringen er allerede lagret. Ikke registrer samme bilag på nytt. {attachmentIssue.message}</p>
   <button type="button" disabled={busy} onClick={retryAttachment}>{busy?"Laster opp …":"Prøv å laste opp originalen igjen"}</button>
  </section>}
  <h3 style={{margin:"28px 0 8px"}}>Registrerte bilag i {period.title}</h3>
  {purchases.length===0?<p className={styles.receiptFooter}>Ingen registrerte leverandørbilag i denne terminen.</p>:
   <div className={styles.receiptList}>{purchases.map(doc=><div key={doc.id} className={styles.receiptItem}>
    <strong>{doc.supplier}</strong>
    <small>{doc.documentNumber} · {doc.date} · {doc.kind==="credit"?"Kreditnota":"Kjøpsfaktura"}</small>
    <small>{money(doc.baseOre+doc.vatOre)} inkl. MVA · Inngående fradrag {money(doc.deductibleVatOre)}</small>
    <small>Originalbilag: {doc.evidenceReference}</small>
    <VatOriginalAttachment documentId={doc.id}/>
    <button type="button" className={styles.textAction} disabled={busy} onClick={()=>voidDoc({
     id:doc.id,documentNumber:doc.documentNumber})}>Opphev registrering</button>
   </div>)}</div>}
  <details className={styles.receiptFooter}><summary>Viktig om originalbilag og MVA</summary>
   <p>Last opp bilde eller PDF og kontroller OCR-forslag før registrering. Originalen bevares uendret når format og filstørrelse tillater det. Større bilder/HEIC lagres som JPEG-kopi; originalen må beholdes eksternt. Oversikten erstatter ikke regnskapsføring eller MVA-melding.</p>
  </details>
 </section>;
}
