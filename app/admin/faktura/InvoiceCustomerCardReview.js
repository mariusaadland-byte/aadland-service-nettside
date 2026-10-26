"use client";
import {useEffect,useState} from "react";
import {invoiceCustomerCardReview} from "../../../lib/invoiceCustomerCardReview";

export default function InvoiceCustomerCardReview({customer,disabled=false,onChoose,sourceQuoteId=""}){
 const [contact,setContact]=useState(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const [applying,setApplying]=useState(false),[checked,setChecked]=useState(false);
 const contactId=customer?.contactId||"";
 async function check(signal){
  const response=await fetch("/api/admin/customer-contacts?contactId="+encodeURIComponent(contactId),
   {cache:"no-store",...(signal?{signal}:{})});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(body.error||"Kundekortet kunne ikke kontrolleres.");
  if(!body.contact)throw Error("Dette kundekortet finnes ikke lenger. Velg en annen kunde.");
  return body.contact;
 }
 useEffect(()=>{
  if(!contactId){setLoading(false);setContact(null);return;}
  let live=true;
  const controller=new AbortController();
  setLoading(true);setChecked(false);setError("");setContact(null);
  check(controller.signal).then(card=>{if(live){setContact(card);setChecked(true);}})
   .catch(e=>{if(live&&!controller.signal.aborted)setError(e.message||"Kontroll mislyktes.");})
   .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;controller.abort();};
 },[contactId]);
 async function refresh(){
  if(loading||applying||disabled)return;
  setLoading(true);setError("");setContact(null);setChecked(false);
  try{setContact(await check());setChecked(true);}
  catch(e){setError(e.message||"Kontroll mislyktes.");}
  finally{setLoading(false);}
 }
 const review=contact?invoiceCustomerCardReview(customer,contact):null;
 async function apply(){
  if(!review?.changed||loading||applying||disabled)return;
  const items=review.fields.map(f=>f.label).join(", ");
  if(!window.confirm("Oppdatere fakturakladden fra kundekortet?\nFelt som endres: "+
   items+"\n\nArbeidsbeskrivelse, leveringsdato, priser, betalingsmåte og manuell forfallsdato beholdes. Ingenting sendes."))return;
  setApplying(true);setError("");
  try{
   await onChoose(contact);
   // The parent persists the draft; the displayed snapshot follows on rerender.
  }catch(e){setError(e.message||"Kunne ikke oppdatere fakturakladden.");}
  finally{setApplying(false);}
 }
 if(!contactId)return null;
 return <section aria-label="Sjekk kundekortet mot fakturakladden"
  style={{margin:"12px 0",padding:12,border:"1px solid #d7c8ad",borderRadius:9,background:"#fff"}}>
  <strong>Sjekk fakturakunden mot kunderegisteret</strong>
  {sourceQuoteId&&<p style={{fontSize:12,margin:"5px 0"}}>
   Denne fakturakladden er laget fra et tilbud. Opplysninger kan være endret på kundekortet siden tilbudet ble laget.
  </p>}
  {loading&&<p role="status" style={{fontSize:13}}>Kontrollerer kundekortet …</p>}
  {error&&<p role="alert" style={{fontSize:13,color:"#9a2b21"}}>
   {error} Eksisterende fakturadata er ikke endret.
  </p>}
  {checked&&review&&!review.changed&&<p role="status" style={{fontSize:13,margin:"7px 0"}}>
   Kundeopplysningene på kladden stemmer med kundekortet.
  </p>}
  {review?.changed&&<>
   <p style={{fontSize:13,margin:"8px 0"}}>
    <strong>{review.fields.length} felt er forskjellige.</strong> Du bestemmer om fakturakladden skal oppdateres.
   </p>
   <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",minWidth:420,fontSize:12}}>
     <thead><tr><th style={{textAlign:"left"}}>Felt</th><th style={{textAlign:"left"}}>På fakturakladden</th>
      <th style={{textAlign:"left"}}>I kunderegisteret</th></tr></thead>
     <tbody>{review.fields.map(f=><tr key={f.key}>
      <th scope="row" style={{textAlign:"left",padding:"6px 4px"}}>{f.label}</th>
      <td style={{padding:"6px 4px",whiteSpace:"pre-wrap"}}>{f.onInvoice||"–"}</td>
      <td style={{padding:"6px 4px",whiteSpace:"pre-wrap"}}>{f.onCard||"–"}</td>
     </tr>)}</tbody>
    </table>
   </div>
   <p style={{fontSize:12,margin:"8px 0"}}>Arbeidsbeskrivelse, leveringsdato, betalingsmåte og priser blir ikke endret.
    Utstedte fakturaer er låst.</p>
   <button type="button" disabled={disabled||loading||applying} onClick={apply}>
    {applying?"Oppdaterer fakturakladden …":"Oppdater kundeopplysninger i kladden"}
   </button>
  </>}
  <button type="button" disabled={disabled||loading||applying} onClick={refresh}
   style={{margin:"7px 0 0 10px"}}>Sjekk på nytt</button>
 </section>;
}
