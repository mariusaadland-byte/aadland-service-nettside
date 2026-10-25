"use client";
import {useEffect,useState} from "react";
import {VAT_CSV_COLUMNS} from "../../../../lib/vatPurchaseCsvImport";
import {initialVatColumnMapping,mapExternalVatRows,VAT_CSV_IMPORT_REQUIRED}
 from "../../../../lib/vatExternalCsvMapping";
const labels={
 type:"Bilagstype (faktura / kreditnota)",
 leverandor:"Leverandørnavn",
 fakturanummer:"Leverandørens fakturanummer",
 dokumentdato:"Dokumentdato",
 opprinnelig_faktura:"Opprinnelig faktura (ved kreditnota)",
 grunnlag_25:"Grunnlag eks. MVA – 25 %",
 mva_25:"MVA-beløp – 25 %",
 grunnlag_15:"Grunnlag eks. MVA – 15 %",
 mva_15:"MVA-beløp – 15 %",
 grunnlag_12:"Grunnlag eks. MVA – 12 %",
 mva_12:"MVA-beløp – 12 %",
 grunnlag_0:"Grunnlag eks. MVA – 0 %",
 mva_0:"MVA-beløp – 0 %",
 fradragsprosent:"Kontrollert fradragsandel (0–100 %)",
 bilagsreferanse:"Referanse til originalbilaget",
 formal:"Hva kjøpet gjelder i virksomheten"
};
export default function VatExternalCsvMapper({source,disabled,onReview}){
 const [mapping,setMapping]=useState(()=>initialVatColumnMapping(source.headers));
 const [error,setError]=useState("");
 const [companyChecked,setCompanyChecked]=useState(false);
 useEffect(()=>{setMapping(initialVatColumnMapping(source.headers));setError("");setCompanyChecked(false);},[source]);
 function choose(field,value){
  setMapping(old=>({...old,[field]:value}));setError("");
 }
 function preview(event){
  event.preventDefault();setError("");
  if(!companyChecked){setError("Bekreft at eksporten gjelder riktig selskap før du går videre.");return;}
  try{onReview(mapExternalVatRows(source,mapping));}
  catch(e){setError(e.message||"Kunne ikke koble eksportkolonnene.");}
 }
 return <section style={{border:"1px solid #dfd0b8",padding:14,borderRadius:9,margin:"12px 0"}}>
  <h3>Velg kolonner fra regnskapseksporten</h3>
  <p style={{fontSize:13}}>
   Dette er <strong>ikke</strong> automatisk Systima-API-import. Velg hvilken kolonne i filen som betyr
   leverandør, fakturanummer, dokumentdato og faktisk dokumentert MVA.
   Vi gjetter ikke MVA-sats eller fradragsrett ut fra regnskapskoder.
  </p>
  <p style={{fontSize:12}}>Fant {source.rows.length} rad(er) og {source.headers.length} kolonner.
   Felt merket * er påkrevd.</p>
  <form onSubmit={preview}>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(245px,1fr))",gap:12}}>
    {VAT_CSV_COLUMNS.map(field=><label key={field} style={{display:"block",fontSize:13}}>
     {labels[field]}{VAT_CSV_IMPORT_REQUIRED.includes(field)?" *":""}
     <select value={mapping[field]||""} disabled={disabled}
      onChange={e=>choose(field,e.target.value)}
      style={{width:"100%",maxWidth:"100%",display:"block"}}>
      <option value="">– Ikke koblet –</option>
      {source.headers.map(header=><option key={header} value={header}>{header}</option>)}
     </select>
    </label>)}
   </div>
   <p style={{fontSize:12,marginTop:12}}>
    Koble alltid både grunnlag og MVA-beløp for hver aktuell sats.
    Dersom eksporten bare har én totalsum eller MVA-kode uten oppdeling, må tallene kontrolleres i originalbilaget
    og eventuelt legges inn i Aadland-malen først.
    En kreditnota må ha opprinnelig fakturanummer.
   </p>
   <label style={{display:"block",fontSize:13,margin:"12px 0"}}>
    <input type="checkbox" checked={companyChecked} disabled={disabled}
     onChange={e=>setCompanyChecked(e.target.checked)}/>
    Jeg har kontrollert at eksportfilen gjelder Aadland Service og ikke et annet selskap.
   </label>
   {error&&<p role="alert" style={{color:"#a52a21"}}>{error}</p>}
   <button type="submit" disabled={disabled||!companyChecked}>Kontroller radene med denne feltkoblingen</button>
  </form>
 </section>;
}
