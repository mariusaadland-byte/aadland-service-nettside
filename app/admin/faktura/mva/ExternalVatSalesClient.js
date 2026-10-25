"use client";
import {useState} from "react";
import VatReceiptScanner from "./VatReceiptScanner";
import {vatDocumentPeriod} from "../../../../lib/vatDocumentPeriod";
const rates=[0,12,15,25];
const empty=()=>Object.fromEntries(rates.map(rate=>[rate,{base:"",vat:""}]));
const amount=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(n)||0)/100);
function parseOre(value){
 if(!/^\d+(?:[,.]\d{1,2})?$/.test(String(value||"").trim()))return null;
 const [w,d=""]=String(value).replace(",",".").split(".");
 const n=Number(w)*100+Number(d.padEnd(2,"0"));
 return Number.isSafeInteger(n)?n:null;
}
const initial=()=>({sourceSystem:"",customerName:"",documentNumber:"",
 documentDate:"",kind:"invoice",originalDocumentNumber:"",
 groups:empty(),documentConfirmed:false,notDuplicateConfirmed:false});
export default function ExternalVatSalesClient({onChanged}){
 const [form,setForm]=useState(initial);
 const [file,setFile]=useState(null);
 const [isCopy,setIsCopy]=useState(false);
 const [grossFromOcr,setGrossFromOcr]=useState(null);
 const [grossCheck,setGrossCheck]=useState(false);
 const [busy,setBusy]=useState(false);
 const [reading,setReading]=useState(false);
 const [pending,setPending]=useState(null);
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 const put=(field,value)=>setForm(x=>({...x,[field]:value}));
 const group=(rate,key,value)=>{setGrossCheck(false);setForm(x=>({...x,groups:{
  ...x.groups,[rate]:{...x.groups[rate],[key]:value}
 }}));};
 const chooseFile=(selected,meta={})=>{
  setFile(selected);setIsCopy(Boolean(meta.converted));setError("");setSuccess("");
  setGrossFromOcr(null);setGrossCheck(false);
  setForm(x=>({...x,customerName:"",documentNumber:"",documentDate:"",
   groups:empty(),documentConfirmed:false,notDuplicateConfirmed:false}));
 };
 const extracted=value=>{
  setForm(x=>({...x,documentNumber:value.documentNumber||"",
   documentDate:value.documentDate||"",groups:{...empty(),...value.groups}}));
  setGrossFromOcr(Number.isSafeInteger(value.totalOre)?value.totalOre:null);
  setGrossCheck(false);
 };
 let base=0,vat=0,valid=true;
 for(const rate of rates){
  const x=form.groups[rate];
  if(!x.base&&!x.vat)continue;
  const n=parseOre(x.base),v=parseOre(x.vat);
  if(n===null||v===null||n<=0||Math.abs(v-Math.round(n*rate/100))>5)valid=false;
  else{base+=n;vat+=v;}
 }
 const gross=base+vat;
 const mismatch=grossFromOcr!==null&&base>0&&Math.abs(grossFromOcr-gross)>5;
 const selected=vatDocumentPeriod(form.documentDate);
 async function attach(id,upload){
  const data=new FormData();data.append("documentId",id);data.append("file",upload);
  const response=await fetch("/api/admin/invoices/vat-external-files",{method:"POST",body:data});
  const json=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(json.error||"Originalfakturaen kunne ikke lastes opp.");
 }
 function finished(date){
  setPending(null);setFile(null);setIsCopy(false);setGrossFromOcr(null);setGrossCheck(false);
  setForm(initial());
  onChanged?.({documentDate:date});
 }
 async function retry(){
  if(!pending||busy)return;
  setBusy(true);setError("");
  try{
   await attach(pending.id,pending.file);
   setSuccess("Originalfakturaen er nå lagret. Dokumentet er med i riktig MVA-termin.");
   finished(pending.documentDate);
  }catch(e){setError(e.message||"Kunne ikke lagre originalfakturaen.");}
  finally{setBusy(false);}
 }
 async function submit(event){
  event.preventDefault();setError("");setSuccess("");
  if(pending){setError("Lagre den ufullstendige filopplastingen først. Ikke lag samme faktura på nytt.");return;}
  if(reading||busy)return;
  if(!file){setError("Du må velge originalfakturaen som PDF eller bilde.");return;}
  if(!selected){setError("Kontroller fakturadatoen.");return;}
  if(!valid||base<=0){setError("Kontroller grunnlag og MVA-beløp på fakturaen.");return;}
  if(mismatch&&!grossCheck){setError("Avvik mot lest totalsum må kontrolleres og bekreftes.");return;}
  if(!form.documentConfirmed||!form.notDuplicateConfirmed){setError("Bekreft dokumentasjonen og at fakturaen ikke er registrert fra før.");return;}
  const message="Importere en eldre "+(form.kind==="credit"?"kreditnota":"kundefaktura")+
    " fra "+form.sourceSystem+"?\n\n"+form.documentNumber+
    "\nFakturadato: "+form.documentDate+" ("+selected.title+")"+
    "\nKunde: "+form.customerName+"\nUtgående MVA: "+amount(vat)+
    "\nTotalt: "+amount(gross)+
    "\n\nDette arkiverer fakturaen til MVA-avstemming. Ingen faktura sendes og ingen betaling registreres."+
    "\nDersom denne terminen er levert, må en eventuell korrigering håndteres separat.";
  if(!window.confirm(message))return;
  setBusy(true);
  try{
   const response=await fetch("/api/admin/invoices/vat-external-sales",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({...form,action:"register"})
   });
   const json=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(json.error||"Fakturaen kunne ikke registreres.");
   const id=json.document?.id;
   if(!id)throw Error("Fakturaen er registrert, men ID mangler. Kontroller registeret før du prøver igjen.");
   try{
    await attach(id,file);
    const date=form.documentDate;
    setSuccess("Den importerte fakturaen og originalfilen er lagret i "+selected.title+".");
    finished(date);
   }catch(attachError){
    setPending({id,file,documentDate:form.documentDate});
    setError("Fakturaen er registrert, men filopplastingen feilet: "+attachError.message+
     " Ikke opprett fakturaen på nytt. Bruk «Prøv filopplasting igjen».");
   }
  }catch(e){setError(e.message||"Registreringen feilet.");}
  finally{setBusy(false);}
 }
 return <section className="card" style={{padding:18,marginBottom:18}} id="eldre-kundefakturaer">
  <h2>Importer kundefakturaer fra tidligere fakturasystemer</h2>
  <p style={{fontSize:13}}>Her lagrer du eldre utgående fakturaer og kreditnotaer som ikke er laget i Aadland Service,
   for eksempel fra Conta eller et annet fakturaprogram. Dokumentdatoen bestemmer MVA-terminen – også for tidligere år.</p>
  <p style={{fontSize:13,background:"#fff2dd",padding:12,borderRadius:10}}>
   <strong>Unngå dobbeltføring:</strong> Importer ikke fakturaer som allerede er med i Aadland Service,
   eller før samme omsetning to ganger i avstemmingen. Dette er arkiv og beregning, ikke utsending, betaling eller bokføring.
  </p>
  <VatReceiptScanner documentType="invoice" disabled={busy||Boolean(pending)}
   onSelected={chooseFile} onExtracted={extracted} onBusyChange={setReading}/>
  {file&&<p style={{fontSize:13}}><strong>Valgt fil:</strong> {file.name}
    {isCopy?" (JPEG-kopi – behold originalen i regnskapet)":" (originalfil)"}</p>}
  <form onSubmit={submit} style={{display:"grid",gap:13}}>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))",gap:12}}>
    <label>Hvilket fakturasystem ble brukt?
     <input required maxLength={100} placeholder="F.eks. Conta" value={form.sourceSystem}
      onChange={e=>put("sourceSystem",e.target.value)}/></label>
    <label>Kundens navn
     <input required maxLength={160} placeholder="Navn fra fakturaen" value={form.customerName}
      onChange={e=>put("customerName",e.target.value)}/></label>
    <label>Dokumenttype
     <select value={form.kind} onChange={e=>put("kind",e.target.value)}>
      <option value="invoice">Kundefaktura</option><option value="credit">Kreditnota</option>
     </select></label>
    <label>Opprinnelig fakturanummer
     <input required maxLength={90} value={form.documentNumber}
      onChange={e=>put("documentNumber",e.target.value)}/></label>
    <label>Fakturadato (styrer MVA-termin)
     <input type="date" required value={form.documentDate} onChange={e=>put("documentDate",e.target.value)}/></label>
    {form.kind==="credit"&&<label>Fakturanummer kreditnotaen gjelder
     <input required value={form.originalDocumentNumber}
      onChange={e=>put("originalDocumentNumber",e.target.value)}/></label>}
   </div>
   {selected&&<p style={{padding:12,background:"#e9f4ee",borderRadius:10,margin:0}}>
    <strong>Legges i {selected.title} ({selected.months}).</strong>
    {" "}Du kan åpne denne terminen etter registreringen, selv om vi nå er i en nyere termin.
   </p>}
   <fieldset style={{border:"1px solid #ccc",borderRadius:10,padding:12}}>
    <legend>Grunnlag og utgående MVA slik det står på fakturaen</legend>
    {rates.map(rate=><div key={rate} style={{display:"flex",gap:9,flexWrap:"wrap",alignItems:"end",marginBottom:10}}>
     <strong style={{width:40}}>{rate} %</strong>
     <label style={{flex:"1 1 120px"}}>Grunnlag eks. MVA
      <input inputMode="decimal" value={form.groups[rate].base} placeholder="0,00"
       onChange={e=>group(rate,"base",e.target.value)}/></label>
     <label style={{flex:"1 1 120px"}}>MVA
      <input inputMode="decimal" value={form.groups[rate].vat} placeholder="0,00"
       onChange={e=>group(rate,"vat",e.target.value)}/></label>
     <button type="button" onClick={()=>{const n=parseOre(form.groups[rate].base);
      if(n!==null)group(rate,"vat",(Math.round(n*rate/100)/100).toFixed(2).replace(".",","));}}>
      Beregn</button>
    </div>)}
    <strong>Eks. MVA {amount(base)} + MVA {amount(vat)} = {amount(gross)} inkl. MVA</strong>
    {!valid&&<p role="alert" style={{color:"#ad2d22"}}>Kontroller at grunnlag og MVA stemmer med hver sats.</p>}
    {mismatch&&<label style={{display:"block",background:"#fff1dd",padding:11,marginTop:10}}>
     <strong>Avvik:</strong> OCR leste {amount(grossFromOcr)}, mens skjemaet viser {amount(gross)}.
     <span style={{display:"block",marginTop:6}}>
      <input type="checkbox" checked={grossCheck} onChange={e=>setGrossCheck(e.target.checked)}/>
      Jeg har kontrollert beløpene mot originalfakturaen.
     </span>
    </label>}
   </fieldset>
   <label><input type="checkbox" checked={form.documentConfirmed}
    onChange={e=>put("documentConfirmed",e.target.checked)}/>
    Jeg har kontrollert originalfakturaen, datoen, kunden og MVA-beløpene.</label>
   <label><input type="checkbox" checked={form.notDuplicateConfirmed}
    onChange={e=>put("notDuplicateConfirmed",e.target.checked)}/>
    Jeg har kontrollert at dette salget ikke allerede er registrert her.</label>
   <button type="submit" disabled={busy||reading||Boolean(pending)||!file||!selected||!valid||base<=0||
     !form.documentConfirmed||!form.notDuplicateConfirmed||(mismatch&&!grossCheck)}>
    {busy?"Lagrer …":"Importer kontrollert kundefaktura"}
   </button>
  </form>
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  {pending&&<div style={{padding:14,background:"#fff1dd",borderRadius:8}}>
   <p><strong>Fakturaen er registrert, men filen mangler.</strong> Ikke importer fakturaen på nytt.</p>
   <button type="button" disabled={busy} onClick={retry}>Prøv filopplasting igjen</button>
  </div>}
  {success&&<p role="status">{success}</p>}
 </section>;
}
