"use client";
import {useState} from "react";
import {parseVatImportCsv,vatCsvTemplate,MAX_VAT_CSV_BYTES,MAX_VAT_IMPORT_ROWS} from "../../../../lib/vatPurchaseCsvImport";
import {parseExternalVatCsv} from "../../../../lib/vatExternalCsvMapping";
import VatExternalCsvMapper from "./VatExternalCsvMapper";

const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(n)||0)/100);
const label={
 new:"Ny – klar til kontroll",existing:"Finnes fra før",conflict:"Avvik",
 review:"Må kontrolleres",invalid:"Ugyldig",duplicateInFile:"Duplikat i filen",
 imported:"Importert",failed:"Importen feilet"
};

export default function VatPurchaseCsvImport({onChanged}){
 const [filename,setFilename]=useState(""),[candidates,setCandidates]=useState([]);
 const [externalSource,setExternalSource]=useState(null);
 const [preview,setPreview]=useState(null),[chosen,setChosen]=useState([]);
 const [documentChecked,setDocumentChecked]=useState(false);
 const [deductionChecked,setDeductionChecked]=useState(false);
 const [bankChecked,setBankChecked]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const selected=chosen.filter(i=>preview?.rows?.[i]?.status==="new");
 const selectedBank=selected.some(i=>preview?.rows?.[i]?.requiresBankCheck);
 const template="data:text/csv;charset=utf-8,"+encodeURIComponent(vatCsvTemplate());

 async function checkRows(rows){
  const response=await fetch("/api/admin/invoices/vat-import",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({action:"preview",rows})
  });
  const result=await response.json();
  if(!response.ok)throw Error(result.error||"Importfilen kunne ikke kontrolleres.");
  return result;
 }
 async function pick(event){
  const file=event.target.files?.[0];event.target.value="";
  setCandidates([]);setPreview(null);setChosen([]);setExternalSource(null);
  setDocumentChecked(false);setDeductionChecked(false);setBankChecked(false);
  setError("");setMessage("");setFilename(file?.name||"");
  if(!file)return;
  if(file.size>MAX_VAT_CSV_BYTES||file.size===0){
   setError("CSV-filen må være maks 256 KB.");return;
  }
  setBusy(true);
  try{
   const content=await file.text();
   let rows;
   try{rows=parseVatImportCsv(content);}
   catch(error){
    if(!String(error.message||"").includes("CSV-kolonnene stemmer ikke"))
     throw error;
    const external=parseExternalVatCsv(content);
    setExternalSource(external);
    setMessage("Eksportfilen har andre kolonner enn Aadland-malen. Velg feltene manuelt før duplikatsjekk. Ingen data er importert.");
    return;
   }
   const result=await checkRows(rows);
   setCandidates(rows);setPreview(result);setChosen([]);
   setMessage("Forhåndsvisningen er klar. Ingenting er importert. Kontroller hvert nytt bilag før du velger det.");
  }catch(e){setError(e.message||"Kunne ikke lese importfilen.");}
  finally{setBusy(false);}
 }
 async function previewMapped(rows){
  if(busy||!rows.length)return;
  setBusy(true);setError("");setMessage("");setPreview(null);setCandidates([]);
  setChosen([]);setDocumentChecked(false);setDeductionChecked(false);setBankChecked(false);
  try{
   const result=await checkRows(rows);
   setCandidates(rows);setPreview(result);setExternalSource(null);
   setMessage("Eksportkolonnene er koblet. Kontroller radene og velg bilag for eventuell registrering. Ingenting er importert.");
  }catch(e){setError(e.message||"Duplikatsjekken kunne ikke fullføres.");}
  finally{setBusy(false);}
 }
 async function rerunPreview(){
  if(!candidates.length||busy)return;
  setBusy(true);setError("");setMessage("");
  try{
   const result=await checkRows(candidates);
   setPreview(result);setChosen([]);setDocumentChecked(false);
   setDeductionChecked(false);setBankChecked(false);
   setMessage("Duplikatsjekken er oppdatert. Ingen data ble importert.");
  }catch(e){setError(e.message||"Kunne ikke oppdatere duplikatsjekken.");}
  finally{setBusy(false);}
 }
 async function importSelected(){
  if(busy||!selected.length||!documentChecked||!deductionChecked||(selectedBank&&!bankChecked))return;
  const numbers=selected.map(i=>candidates[i].documentNumber);
  const total=selected.reduce((sum,i)=>sum+(preview.rows[i].deductibleVatOre||0)*(candidates[i].kind==="credit"?-1:1),0);
  const confirmed=window.confirm(
   "Registrere "+selected.length+" valgte leverandørbilag i Aadland Service?\n\n"+
   "Numre: "+numbers.join(", ").slice(0,290)+"\n"+
   "Samlet vurdert inngående MVA: "+money(total)+"\n\n"+
   "Dette legger bilagene til i den interne MVA-oversikten. Originale regnskapsbilag og fradragsrett må være kontrollert. "+
   "Ingenting bokføres eller sendes til Systima. Hvis enkelte bilag feiler, beholdes de som allerede er registrert.");
  if(!confirmed)return;
  setBusy(true);setError("");setMessage("");
  let imported=0,failed=0;const resultRows=preview.rows.map(x=>({...x})),failures=[];
  for(const i of selected){
   const row=candidates[i];
   try{
    const response=await fetch("/api/admin/invoices/vat-purchases",{
     method:"POST",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({
      ...row,action:"register",documentConfirmed:true,deductionConfirmed:true,
      bankConditionConfirmed:bankChecked
     })
    });
    const data=await response.json();
    if(!response.ok)throw Error(data.error||"Registrering ble ikke bekreftet.");
    resultRows[i].status="imported";
    resultRows[i].message="Registrert – kontroller originalvedlegg ved behov";
    imported++;
   }catch(e){
    resultRows[i].status="failed";
    resultRows[i].message=e.message||"Kunne ikke bekrefte import";
    failures.push("Rad "+(i+2)+": "+resultRows[i].message);
    failed++;
   }
  }
  setPreview(x=>({...x,rows:resultRows}));
  setChosen([]);setDocumentChecked(false);setDeductionChecked(false);setBankChecked(false);
  if(imported)onChanged?.();
  setMessage(imported+" bilag registrert"+(failed?" · "+failed+" ikke bekreftet":"")+
   ". Kontroller oversikten og oppdater duplikatsjekken før eventuell ny import.");
  if(failures.length)setError(failures.slice(0,6).join(" / ")+
   ". Et bilag kan ha blitt lagret selv om forbindelsen feilet. Oppdater duplikatsjekken før nytt forsøk.");
  setBusy(false);
 }
 return <section className="card" style={{padding:18,marginBottom:18}}>
  <h2>Importer leverandørbilag fra CSV</h2>
  <p style={{fontSize:13}}>
   Du kan bruke <strong>Aadland-CSV-malen</strong> direkte, eller laste opp en CSV-eksport fra et annet
   regnskapssystem og koble eksportens kolonner manuelt. Vi gjetter ikke MVA-koder eller fradragsrett.
   Direkte Systima-API-import er fortsatt deaktivert.
   Ingenting blir importert før du velger og godkjenner bilagene.
  </p>
  <p><a download="aadland-leverandorbilag-mal.csv" href={template}>Last ned CSV-mal med eksempel</a> <small>– slett eksempelet og fyll inn ekte bilag før import.</small></p>
  <label style={{display:"block",marginBottom:10}}>
   Velg CSV-fil (UTF-8, semikolon, maks {MAX_VAT_IMPORT_ROWS} bilag og 256 KB)
   <input type="file" accept=".csv,text/csv" disabled={busy} onChange={pick}/>
  </label>
  {filename&&<p style={{fontSize:12}}>Fil: {filename}</p>}
  {externalSource&&<VatExternalCsvMapper source={externalSource}
   disabled={busy} onReview={previewMapped}/>}
  {busy&&<p role="status">Kontrollerer / importerer …</p>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
  {message&&<p role="status">{message}</p>}
  {preview&&<>
   <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",margin:"12px 0"}}>
    <strong>{preview.counts.new} nye</strong>
    <span>{preview.counts.existing} finnes allerede</span>
    <span>{preview.counts.conflict} avvik</span>
    <span>{preview.counts.invalid} ugyldige/duplikater</span>
    <button type="button" disabled={busy} onClick={rerunPreview}>Oppdater duplikatsjekk</button>
   </div>
   <div style={{overflowX:"auto"}}>
    <table style={{minWidth:820,width:"100%",borderCollapse:"collapse",fontSize:13}}>
     <thead><tr><th scope="col">Velg</th><th scope="col">Rad</th><th scope="col">Leverandør</th>
      <th scope="col">Bilag</th><th scope="col">Dato</th>
      <th scope="col" style={{textAlign:"right"}}>MVA</th>
      <th scope="col" style={{textAlign:"right"}}>Vurdert fradrag</th><th scope="col">Status</th></tr></thead>
     <tbody>{preview.rows.map(item=><tr key={item.index} style={{borderBottom:"1px solid #ddd1c0"}}>
      <td><input type="checkbox" aria-label={"Velg rad "+(item.index+2)}
       checked={chosen.includes(item.index)} disabled={busy||item.status!=="new"}
       onChange={event=>setChosen(x=>event.target.checked?[...x,item.index]:x.filter(v=>v!==item.index))}/></td>
      <td>{item.index+2}</td>
      <td>{item.supplierName||candidates[item.index]?.supplierName}</td>
      <td>{item.documentNumber||candidates[item.index]?.documentNumber}</td>
      <td>{item.documentDate||candidates[item.index]?.documentDate}</td>
      <td style={{textAlign:"right"}}>{Number.isSafeInteger(item.vatOre)?money(item.vatOre):"–"}</td>
      <td style={{textAlign:"right"}}>{Number.isSafeInteger(item.deductibleVatOre)?money(item.deductibleVatOre):"–"}</td>
      <td><strong>{label[item.status]||item.status}</strong><div style={{fontSize:12}}>{item.message}</div>
       {item.requiresBankCheck&&<small>Bankbetaling må være kontrollert</small>}
      </td>
     </tr>)}</tbody>
    </table>
   </div>
   {selected.length>0&&<div style={{padding:12,border:"1px solid #d9cdbb",borderRadius:8,marginTop:14}}>
    <p><strong>{selected.length} bilag valgt for import.</strong></p>
    <label style={{display:"block",marginBottom:9}}>
     <input type="checkbox" checked={documentChecked} onChange={e=>setDocumentChecked(e.target.checked)}/>
     Jeg har kontrollert de valgte originalbilagene og vet hvor dokumentasjonen er lagret.
    </label>
    <label style={{display:"block",marginBottom:9}}>
     <input type="checkbox" checked={deductionChecked} onChange={e=>setDeductionChecked(e.target.checked)}/>
     Jeg har vurdert MVA-fradragsrett og fradragsandel for hvert valgt bilag.
    </label>
    {selectedBank&&<label style={{display:"block",marginBottom:9}}>
     <input type="checkbox" checked={bankChecked} onChange={e=>setBankChecked(e.target.checked)}/>
     Jeg har kontrollert krav om bankbetaling for valgte kjøp på minst 10 000 kr.
    </label>}
    <button type="button" disabled={busy||!documentChecked||!deductionChecked||(selectedBank&&!bankChecked)}
     onClick={importSelected}>Importer {selected.length} kontrollert{selected.length===1?" bilag":"e bilag"}</button>
   </div>}
  </>}
  <p style={{fontSize:12,marginTop:14}}>
   <strong>Viktig:</strong> Dette er import til Aadland Service sitt interne MVA-register, ikke bokføring i Systima.
   Importen lager ikke automatisk originalvedlegg. Legg ved originalfilen på bilaget etter import dersom du ønsker
   kopi her. Ved feil i en enkelt rad kan tidligere rader allerede være registrert; duplikatsjekken hindrer at de registreres på nytt.
  </p>
 </section>;
}
