"use client";
import {useState} from "react";
export default function SplitInvoiceSelfTestClient(){
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState(null);
 const [checking,setChecking]=useState(false);
 const [checkResult,setCheckResult]=useState(null);
 async function checkSetup(){
  if(busy||checking)return;
  setChecking(true);setCheckResult(null);
  try{
   const response=await fetch("/api/admin/invoices/selftest/readiness",{cache:"no-store"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"Kontrollen kunne ikke gjennomføres.");
   setCheckResult({ok:true,checks:data.checks,checkedOn:data.checkedOn});
  }catch(error){setCheckResult({ok:false,error:error.message||"Kontrollen feilet."});}
  finally{setChecking(false);}
 }
 async function sendSelfTest(){
  if(busy)return;
  if(!window.confirm("Sende EN test-e-post med to tydelig merkede demo-PDF-er til post@aadland-service.no?\n\nIngen ekte faktura, fakturanummer eller regnskapsføring opprettes. E-posten sendes bare dersom du bekrefter."))return;
  setBusy(true);setResult(null);
  try{
   const response=await fetch("/api/admin/invoices/selftest",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"send-to-company",confirmed:true})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||"Test-e-posten kunne ikke sendes.");
   setResult({ok:true,text:data.message+" Mottaker: "+data.recipient});
  }catch(e){setResult({ok:false,text:e.message||"Uklar sendestatus. Kontroller Resend før et nytt forsøk."});}
  finally{setBusy(false);}
 }
 return <section className="card" style={{padding:20,marginTop:18}}>
  <h2>Test PDF-er og e-post</h2>
  <div style={{margin:"14px 0",padding:"12px 0",borderBottom:"1px solid #ddd"}}>
   <button type="button" disabled={checking||busy} onClick={checkSetup}>
    {checking?"Kontrollerer PDF-er og innstillinger …":"Kontroller testoppsettet – uten utsending"}
   </button>
   {checkResult&&<div role={checkResult.ok?"status":"alert"} style={{marginTop:10}}>
    {!checkResult.ok?<p>{checkResult.error}</p>:<>
     <p style={{fontSize:13}}>Kontrollert {checkResult.checkedOn}. Denne kontrollen sender ikke e-post og gjør ingen regnskapsendringer.</p>
     <ul style={{paddingLeft:20,margin:"8px 0"}}>
      {[
       ["Beløp og 40/60-fordeling",checkResult.checks?.exampleAmountsCorrect],
       ["To PDF-er ble opprettet",checkResult.checks?.pdfsGenerated],
       ["TEST-merking finnes på begge",checkResult.checks?.pdfsClearlyMarked],
       ["Ingen bank-/Vipps-betalingsinstruksjoner",checkResult.checks?.noPaymentInstructions],
       ["E-postnøkkel konfigurert",checkResult.checks?.emailConfigured],
       ["Cron-nøkkel konfigurert",checkResult.checks?.cronConfigured]
      ].map(([label,ok])=><li key={label} style={{fontSize:13}}>
       <strong>{ok?"OK":"Mangler / krever kontroll"}</strong> – {label}
      </li>)}
     </ul>
     <p className="muted" style={{fontSize:12}}>{checkResult.checks?.note}</p>
    </>}
   </div>}
  </div>
  <p>Begge PDF-ene lages med samme motor som vanlige fakturaer, men er merket som ugyldige testdokumenter. De har verken ekte fakturanummer eller betalingskrav.</p>
  <div style={{display:"flex",flexWrap:"wrap",gap:12,margin:"18px 0"}}>
   <a className="btn alt" href="/api/admin/invoices/selftest?part=1" target="_blank" rel="noreferrer">Se faktura 1 (TEST-PDF)</a>
   <a className="btn alt" href="/api/admin/invoices/selftest?part=2" target="_blank" rel="noreferrer">Se faktura 2 (TEST-PDF)</a>
  </div>
  <p style={{fontSize:14}}>Valgfritt: Send de samme to testdokumentene som vedlegg via den ekte e-posttjenesten til <strong>post@aadland-service.no</strong>. Dette tester faktisk innsending til e-postleverandøren, men ikke kundelevering eller automatisk utsendelse på en fremtidig dato.</p>
  <button type="button" disabled={busy} onClick={sendSelfTest}>
   {busy?"Kontrollerer testutsendelsen …":"Send test-e-post til firmaet"}
  </button>
  {result&&<p role={result.ok?"status":"alert"} style={{border:"1px solid #d8c9ae",borderRadius:8,padding:12,marginTop:12}}>
   <strong>{result.ok?"E-posttjenesten bekreftet testen.":"Testen krever kontroll."}</strong> {result.text}
  </p>}
  <p className="muted" style={{fontSize:12,marginTop:12}}>Flere klikk samme dag benytter samme sendingsnøkkel hos leverandøren for å begrense duplikater. Ingen kontakt med kunderegisteret og ingen regnskapsdata blir endret.</p>
 </section>;
}
