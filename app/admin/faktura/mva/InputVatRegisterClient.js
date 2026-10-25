"use client";
import {useState} from "react";
import VatOriginalAttachment from "./VatOriginalAttachment";
import VatReceiptScanner from "./VatReceiptScanner";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(n)||0)/100);
const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const blank=()=>({0:{base:"",vat:""},12:{base:"",vat:""},15:{base:"",vat:""},25:{base:"",vat:""}});
const parse=value=>{
 if(!/^\d+(?:[,.]\d{1,2})?$/.test(String(value||"").trim()))return null;
 const [whole,decimals=""]=String(value).replace(",",".").split(".");
 return Number(whole)*100+Number(decimals.padEnd(2,"0"));
};
const moneyInput=ore=>(ore/100).toFixed(2).replace(".",",");
const rates=[0,12,15,25];
export default function InputVatRegisterClient({purchases,period,onChanged}){
 const [form,setForm]=useState({
  supplierName:"",documentNumber:"",documentDate:today(),kind:"purchase",
  originalDocumentNumber:"",evidenceReference:"",businessPurpose:"",
  deductionPercent:"100",groups:blank(),documentConfirmed:false,
  deductionConfirmed:false,bankConditionConfirmed:false
 });
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const [receiptFile,setReceiptFile]=useState(null);
 const [receiptIsCopy,setReceiptIsCopy]=useState(false);
 const [ocrGrossOre,setOcrGrossOre]=useState(null);
 const [ocrMismatchChecked,setOcrMismatchChecked]=useState(false);
 const [scanBusy,setScanBusy]=useState(false);
 const [attachmentIssue,setAttachmentIssue]=useState(null);
 const chooseReceipt=(file,meta={})=>{
  setReceiptFile(file);setReceiptIsCopy(Boolean(meta.converted));setAttachmentIssue(null);setError("");setSuccess("");
  setOcrGrossOre(null);setOcrMismatchChecked(false);
  setForm(x=>({...x,supplierName:"",documentNumber:"",documentDate:"",
   groups:blank(),evidenceReference:meta.converted?"Aadland MVA – vedlagt JPEG-kopi, original beholdes eksternt":"Aadland MVA – privat originalvedlegg",
   documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false}));
 };
 const receiveScan=result=>{
  setOcrGrossOre(Number.isSafeInteger(result.totalOre)?result.totalOre:null);
  setOcrMismatchChecked(false);
  setForm(x=>({...x,supplierName:result.supplierName||"",documentNumber:result.documentNumber||"",
   documentDate:result.documentDate||"",groups:{...blank(),...result.groups}}));
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
   onChanged?.();
  }catch(e){setError("Originalbilaget er fortsatt ikke lagret: "+(e.message||"ukjent feil"));}
  finally{setBusy(false);}
 };
 const set=(name,value)=>setForm(x=>({...x,[name]:value}));
 const setGroup=(rate,key,value)=>{setOcrMismatchChecked(false);setForm(x=>({...x,groups:{...x.groups,[rate]:{...x.groups[rate],[key]:value}}}));};
 let netTotal=0,vatTotal=0,valid=true;
 for(const rate of rates){
  const line=form.groups[rate],n=parse(line.base),v=parse(line.vat);
  if(line.base||line.vat){
   if(n===null||v===null||n<=0||Math.abs(v-Math.round(n*rate/100))>5)valid=false;
   else {netTotal+=n;vatTotal+=v;}
  }
 }
 const percent=Number(form.deductionPercent);
 const deductible=Math.round(vatTotal*percent/100);
 const ocrGrossMismatch=ocrGrossOre!==null&&netTotal>0&&Math.abs(ocrGrossOre-(netTotal+vatTotal))>5;
 const submit=async e=>{
  e.preventDefault();setError("");setSuccess("");
  if(scanBusy){setError("Kvitteringen leses fortsatt. Vent til lesingen er ferdig.");return;}
  if(!valid||netTotal<=0){setError("Kontroller grunnlag og MVA på hver sats (avrundingsavvik maks 0,05 kr).");return;}
  if(ocrGrossMismatch&&!ocrMismatchChecked){setError("OCR-summen stemmer ikke med beløpene. Kontroller kvitteringen og bekreft avviket før registrering.");return;}
  const question="Registrere et kontrollert leverandørbilag i intern MVA-avstemming?\n\n"+
   form.supplierName+" – "+form.documentNumber+"\nDokumentdato: "+form.documentDate+
   "\n"+(form.kind==="credit"?"Kreditnota":"Kjøpsfaktura")+
   "\nBrutto beløp: "+money(netTotal+vatTotal)+
   "\nFradragsandel: "+percent+" %\nFradragsberettiget inngående MVA: "+
   money(deductible)+"\n\nOriginalbilaget må fortsatt bevares i regnskapssystemet.";
  if(!window.confirm(question))return;
  setBusy(true);
  try{
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
     setAttachmentIssue({documentId,file:receiptFile,message:attachmentError.message||"Ukjent feil"});
    }
   }
   setSuccess(attachmentSaved
    ?receiptFile?(receiptIsCopy?"Bilaget og en JPEG-kopi er lagret privat. Behold originalfilen i regnskapet.":"Bilaget og originalkvitteringen er lagret privat.")+" MVA-oversikten oppdateres.":"Bilaget er registrert. MVA-oversikten oppdateres."
    :"Bilaget er registrert, men originalfilen er IKKE lagret. Bruk knappen nedenfor for å prøve igjen.");
   setReceiptFile(null);setReceiptIsCopy(false);setOcrGrossOre(null);setOcrMismatchChecked(false);
   setForm(x=>({...x,documentNumber:"",originalDocumentNumber:"",
    evidenceReference:"",businessPurpose:"",groups:blank(),
    documentConfirmed:false,deductionConfirmed:false,bankConditionConfirmed:false}));
   // A failed upload must keep the retry control and selected original visible.
   if(attachmentSaved)onChanged?.();
  }catch(e){setError(e.message||"Registreringen mislyktes.");}
  finally{setBusy(false);}
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
 return <section className="card" style={{padding:18,marginBottom:18}}>
  <h2>Registrer inngående MVA fra leverandørbilag</h2>
  <p style={{fontSize:13}}>Dette er <strong>manuelle referanser til faktiske bilag</strong> i regnskapet,
   ikke import av leverandørprislisten. Ta med originalfakturaens dokumentdato og MVA-beløp.
   Leverandørkreditnotaer reduserer inngående MVA i sin utstedelsestermin.</p>
  <VatReceiptScanner onSelected={chooseReceipt} onExtracted={receiveScan}
   onBusyChange={setScanBusy} disabled={busy}/>
  {receiptFile&&<p style={{fontSize:13,background:"#f1faf3",padding:10,borderRadius:8}}>
   <strong>{receiptIsCopy?"Valgt JPEG-kopi:":"Valgt originalfil:"}</strong> {receiptFile.name}. Filen lagres privat etter at du godkjenner bilaget. {receiptIsCopy&&"Kildebildet må fortsatt oppbevares separat."}
   <button type="button" style={{marginLeft:10}} disabled={busy||scanBusy} onClick={()=>{setReceiptFile(null);setReceiptIsCopy(false);}}>Ikke legg ved filen</button>
  </p>}
  <form onSubmit={submit} style={{display:"grid",gap:12}}>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10}}>
    <label>Type bilag
     <select value={form.kind} onChange={e=>set("kind",e.target.value)}>
      <option value="purchase">Kjøpsfaktura/kvittering</option>
      <option value="credit">Kreditnota fra leverandør</option>
     </select>
    </label>
    <label>Leverandør
     <input required maxLength={160} value={form.supplierName} onChange={e=>set("supplierName",e.target.value)} placeholder="For eksempel Megaflis"/>
    </label>
    <label>Faktura-/kreditnotanummer
     <input required maxLength={90} value={form.documentNumber} onChange={e=>set("documentNumber",e.target.value)}/>
    </label>
    <label>Dokumentdato
     <input type="date" required value={form.documentDate} onChange={e=>set("documentDate",e.target.value)}/>
    </label>
    {form.kind==="credit"&&<label>Opprinnelig fakturanummer
     <input required value={form.originalDocumentNumber} onChange={e=>set("originalDocumentNumber",e.target.value)}/>
    </label>}
   </div>
   <fieldset style={{border:"1px solid #d8cdbb",borderRadius:8,padding:12}}>
    <legend>Beløp fra bilaget – oppgi eks. MVA og MVA</legend>
    {rates.map(rate=><div key={rate} style={{display:"flex",gap:8,alignItems:"end",flexWrap:"wrap",padding:"6px 0",borderBottom:"1px solid #e6ded3"}}>
     <strong style={{minWidth:45}}>{rate} %</strong>
     <label style={{flex:"1 1 125px"}}>Grunnlag eks. MVA (kr)
      <input inputMode="decimal" placeholder="0,00" value={form.groups[rate].base}
       onChange={e=>setGroup(rate,"base",e.target.value)}/>
     </label>
     <label style={{flex:"1 1 125px"}}>MVA fra bilaget (kr)
      <input inputMode="decimal" placeholder="0,00" value={form.groups[rate].vat}
       onChange={e=>setGroup(rate,"vat",e.target.value)}/>
     </label>
     <button type="button" onClick={()=>{
      const n=parse(form.groups[rate].base);
      if(n===null)return;
      setGroup(rate,"vat",moneyInput(Math.round(n*rate/100)));
     }}>Beregn {rate} %</button>
    </div>)}
    <p style={{margin:"10px 0 0",fontSize:13}}>
     Dokumentet: <strong>{money(netTotal)} eks. MVA + {money(vatTotal)} MVA = {money(netTotal+vatTotal)} inkl. MVA</strong>
    </p>
    {!valid&&<p role="alert" style={{color:"#a52a21"}}>MVA og grunnlag stemmer ikke med satsen eller beløpet er ugyldig.</p>}
    {ocrGrossOre!==null&&<p style={{margin:"9px 0",fontSize:13}}>
      Gjenkjent sum fra kvitteringen: <strong>{money(ocrGrossOre)}</strong>.
    </p>}
    {ocrGrossMismatch&&<label role="alert" style={{display:"block",background:"#fff1e9",padding:10,borderRadius:8,fontSize:13,color:"#863c24"}}>
     <strong>Avvik!</strong> OCR leste {money(ocrGrossOre)}, men feltene summerer til {money(netTotal+vatTotal)}.
     Kontroller originalkvitteringen og korriger beløpene.
     <span style={{display:"block",marginTop:7}}>
      <input type="checkbox" checked={ocrMismatchChecked} onChange={e=>setOcrMismatchChecked(e.target.checked)}/>
      Jeg har kontrollert summen mot kvitteringen og vil bruke de manuelt angitte beløpene.
     </span>
    </label>}
   </fieldset>
   <label>Fradragsberettiget andel av MVA (%)
    <input type="number" min="0" max="100" step="1" required value={form.deductionPercent}
     onChange={e=>set("deductionPercent",e.target.value)}/>
   </label>
   <p style={{margin:0}}>Forslag til fradrag etter valgt andel: <strong>{money(deductible)}</strong>
    {form.kind==="credit"&&" trekkes fra inngående MVA"}</p>
   <label>Hvor er originalbilaget lagret? (referanse i regnskapssystemet)
    <input required maxLength={260} placeholder="For eksempel Systemia bilag #123"
     value={form.evidenceReference} onChange={e=>set("evidenceReference",e.target.value)}/>
   </label>
   <div style={{fontSize:13}}>
    <strong>Hurtigvalg – hva gjelder kjøpet?</strong>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
     {["Materialer til kundeoppdrag","Verktøy og utstyr","Driftskostnad","Transport i virksomheten"].map(purpose=>
      <button key={purpose} type="button" onClick={()=>set("businessPurpose",purpose)}>{purpose}</button>)}
    </div>
   </div>
   <label>Bruksområde i virksomheten
    <textarea required rows={2} maxLength={500} placeholder="Beskriv hva kjøpet gjelder"
     value={form.businessPurpose} onChange={e=>set("businessPurpose",e.target.value)}/>
   </label>
   <label><input type="checkbox" checked={form.documentConfirmed}
    onChange={e=>set("documentConfirmed",e.target.checked)}/>
    Jeg har kontrollert leverandørbilaget og har originaldokumentasjonen tilgjengelig i regnskapet.</label>
   <label><input type="checkbox" checked={form.deductionConfirmed}
    onChange={e=>set("deductionConfirmed",e.target.checked)}/>
    Jeg har vurdert fradragsretten og at fradragsandelen er korrekt for avgiftspliktig virksomhet.</label>
   {form.kind==="purchase"&&netTotal+vatTotal>=1000000&&<label><input type="checkbox" checked={form.bankConditionConfirmed}
    onChange={e=>set("bankConditionConfirmed",e.target.checked)}/>
    Jeg har kontrollert kravet om betaling via bank for kjøp på minst 10 000 kr inkl. MVA.</label>}
   <button type="submit" disabled={busy||scanBusy||(ocrGrossMismatch&&!ocrMismatchChecked)||!valid||netTotal<=0||!form.documentConfirmed||!form.deductionConfirmed||
    (form.kind==="purchase"&&netTotal+vatTotal>=1000000&&!form.bankConditionConfirmed)}>
    {busy?"Lagrer …":"Registrer kontrollert bilag"}
   </button>
  </form>
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  {success&&<p role="status">{success}</p>}
  {attachmentIssue&&<section role="alert" style={{background:"#fff1e9",border:"1px solid #df9f80",padding:13,borderRadius:10}}>
   <strong>Originalbilaget mangler.</strong>
   <p>Registreringen er allerede lagret. Ikke registrer samme bilag på nytt. {attachmentIssue.message}</p>
   <button type="button" disabled={busy} onClick={retryAttachment}>{busy?"Laster opp …":"Prøv å laste opp originalen igjen"}</button>
  </section>}
  <h3 style={{marginTop:22}}>Registrerte bilag i {period.title}</h3>
  {purchases.length===0?<p>Ingen manuelt registrerte leverandørbilag i denne terminen.</p>:
   <div style={{display:"grid",gap:8}}>{purchases.map(doc=><div key={doc.id}
    style={{padding:12,border:"1px solid #ded3c0",borderRadius:8}}>
    <strong>{doc.supplier}</strong> · {doc.documentNumber} · {doc.date}
    <div style={{fontSize:13}}>{doc.kind==="credit"?"Leverandørkreditnota":"Kjøpsfaktura"}
     {" · "}{money(doc.baseOre+doc.vatOre)} inkl. MVA · Inngående fradrag {money(doc.deductibleVatOre)}</div>
    <small>Originalbilag: {doc.evidenceReference}</small>
    <VatOriginalAttachment documentId={doc.id}/>
    <div><button type="button" disabled={busy} onClick={()=>voidDoc({
     id:doc.id,documentNumber:doc.documentNumber})}>Opphev registrering</button></div>
   </div>)}</div>}
  <p style={{fontSize:12,marginTop:15}}>
   <strong>Viktig:</strong> Ta bilde eller velg PDF før registrering. Originalen lagres uendret når formatet støttes og filen er under 4 MB. Større bilder/HEIC lagres som merket JPEG-kopi, og kilden må fortsatt oppbevares eksternt. OCR-forslag må kontrolleres, og bilaget må fortsatt oppbevares i regnskapssystemet.
   Denne oversikten garanterer ikke fradragsrett og erstatter ikke bokføring eller MVA-melding.
  </p>
 </section>;
}
