"use client";
import {useState} from "react";
import styles from "./TripletexReceipts.module.css";

const endpoint="/api/admin/invoices/tripletex/reconcile";
const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(ore||0)/100);
const checks=[
 ["supplier","Leverandør og leverandørens faktura-/kvitteringsnummer stemmer."],
 ["total","Bruttobeløp og dokumentdato er kontrollert mot originalen."],
 ["vatAndDeduction","MVA-kode, fradragsandel og fradragsført MVA er kontrollert."],
 ["original","Originalbilaget er tilknyttet riktig bokføring i Tripletex."],
 ["noDuplicate","Bilaget er ikke bokført dobbelt eller brukt for et annet kjøp."],
 ["bookedInTripletex","Bilaget er faktisk bokført og står under bokførte bilag i Tripletex."]
];
export default function TripletexReceiptReconciliationPanel({row,onClose,onVerified}){
 const [voucherId,setVoucherId]=useState("");
 const [checkedVoucher,setCheckedVoucher]=useState(null);
 const [checked,setChecked]=useState({});
 const [vatCode,setVatCode]=useState("");
 const [accountCode,setAccountCode]=useState("");
 const [note,setNote]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [info,setInfo]=useState("");
 const doc=row.document;
 const ready=checkedVoucher?.remote?.canReview===true&&checks.every(([key])=>checked[key]===true)&&
  vatCode.trim()!==""&&/^\d{3,8}$/.test(accountCode.trim())&&note.trim().length>=12;

 async function request(body){
  const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({documentId:doc.id,voucherId,...body})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"Tripletex-kontrollen kunne ikke fullføres.");
  return data;
 }
 async function checkVoucher(){
  if(busy||!/^[1-9]\d{0,14}$/.test(voucherId.trim())){setError("Skriv riktig Tripletex bilags-ID.");return;}
  setBusy(true);setError("");setInfo("");setCheckedVoucher(null);setChecked({});
  try{
   const data=await request({action:"check"});
   setCheckedVoucher(data);
   setInfo("Bilaget er funnet i Tripletex. Kontroller at dette er riktig kjøp før du bekrefter bokføringen.");
  }catch(e){setError(e.message);}
  finally{setBusy(false);}
 }
 async function confirm(){
  if(busy||!ready||!checkedVoucher)return;
  if(!window.confirm("Bekreft at du har sammenlignet originalen med et faktisk bokført Tripletex-bilag. Dette registrerer kun avstemmingen – det sender eller bokfører ingenting."))return;
  setBusy(true);setError("");setInfo("");
  try{
   const data=await request({
    action:"confirm",expectedVoucherNumber:checkedVoucher.remote.number,
    expectedVoucherYear:checkedVoucher.remote.year,
    expectedSupplierDocumentNumber:doc.supplier_document_number,
    originalSha256:row.attachment.sha256,
    vatCode:vatCode.trim(),accountCode:accountCode.trim(),
    note:note.trim(),confirmed:checked
   });
   setInfo(data.message||"Bokføringskontrollen er registrert.");
   await onVerified();
  }catch(e){setError(e.message);}
  finally{setBusy(false);}
 }
 return <div className={styles.reconcilePanel}>
  <h3>Kontroller faktisk bokføring i Tripletex</h3>
  <p className={styles.hint}>E-post «akseptert» er ikke bevis på bokføring. Her henter vi bare et eksisterende bilag fra Tripletex. Vi oppretter ingen nye bilag, og alle valgene må kontrolleres mot originalen.</p>
  <p className={styles.hint}><strong>Original:</strong> {doc.supplier_name} · {doc.supplier_document_number} · {doc.document_date}<br/>
   <strong>Beløp:</strong> {money(Number(doc.base_ore)+Number(doc.vat_ore))} inkl. MVA · MVA {money(doc.vat_ore)} · fradragsberettiget {money(doc.deductible_vat_ore)} ({doc.deduction_percent} %)
  </p>
  <div className={styles.reconcileActions}>
   <label>Tripletex bilags-ID (ikke leverandørens fakturanummer)
    <input type="text" inputMode="numeric" pattern="[0-9]*" value={voucherId}
     onChange={e=>{setVoucherId(e.target.value.replace(/[^0-9]/g,""));setCheckedVoucher(null);setChecked({});}} placeholder="Bilags-ID i Tripletex" autoComplete="off"/>
   </label>
   <button type="button" className={styles.primary} disabled={busy||!voucherId.trim()} onClick={checkVoucher}>
    {busy?"Kontrollerer …":"Hent bilag fra Tripletex"}
   </button>
  </div>
  {error&&<p className={styles.error} role="alert">{error}</p>}
  {info&&<p role="status" className={styles.progress}>{info}</p>}
  {checkedVoucher&&<div className={styles.reconcileResult}>
   <strong>Tripletex: {checkedVoucher.remote.year} / bilag {checkedVoucher.remote.number}</strong>
   <p>Bilags-ID {checkedVoucher.remote.voucherId} · bokføringsdato {checkedVoucher.remote.date} · {checkedVoucher.remote.postingCount} poster</p>
   <p>Konti fra API: {checkedVoucher.remote.accounts.join(", ")||"Må sjekkes i Tripletex"} · MVA-koder fra API: {checkedVoucher.remote.vatCodes.join(", ")||"Må sjekkes i Tripletex"}</p>
   {checkedVoucher.remote.canReview===false?
    <p className={styles.error}>Tripletex bekrefter ikke at dette er et ferdig bilag. Kontroll må gjøres i Tripletex før videre registrering.</p>:
    <>
     <p className={styles.hint}>At Tripletex finner denne ID-en betyr ikke automatisk at den tilhører riktig kvittering. Åpne bilaget i Tripletex og kontroller alt under.</p>
     <div className={styles.reconcileChecks}>
      {checks.map(([key,label])=><label className={styles.check} key={key}>
       <input type="checkbox" checked={checked[key]===true}
        onChange={e=>setChecked(current=>({...current,[key]:e.target.checked}))}/>{label}
      </label>)}
     </div>
     <div className={styles.inputs}>
      <label>Kontrollert MVA-kode i Tripletex
       <input value={vatCode} maxLength={50} onChange={e=>setVatCode(e.target.value)} placeholder="MVA-kode"/>
      </label>
      <label>Regnskapskonto i Tripletex
       <input value={accountCode} inputMode="numeric" maxLength={8}
        onChange={e=>setAccountCode(e.target.value.replace(/\D/g,""))} placeholder="F.eks. 6550"/>
      </label>
     </div>
     <label className={styles.reconcileNote}>Hva har du kontrollert?
      <textarea value={note} rows={3} maxLength={1200}
       onChange={e=>setNote(e.target.value)}
       placeholder="Bekreft dokumentnummer, beløp og MVA mot bokført Tripletex-bilag."/>
     </label>
     <div className={styles.actions}>
      <button type="button" className={styles.primary} disabled={!ready||busy} onClick={confirm}>
       Bekreft kontrollert bokføring
      </button>
     </div>
    </>}
  </div>}
  <button type="button" className={styles.linkButton} onClick={onClose} disabled={busy}>Lukk kontrollen</button>
 </div>;
}
