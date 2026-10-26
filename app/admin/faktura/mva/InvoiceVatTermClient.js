"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import InputVatRegisterClient from "./InputVatRegisterClient";
import VatPurchaseCsvImport from "./VatPurchaseCsvImport";
import ExternalVatSalesClient from "./ExternalVatSalesClient";
import {vatDocumentPeriod} from "../../../../lib/vatDocumentPeriod";
import VatReportingControlClient from "./VatReportingControlClient";
import VatSubmissionReviewClient from "./VatSubmissionReviewClient";
import {vatSettlementPreview} from "../../../../lib/vatSettlementPreview";

const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(n)||0)/100);
const labels=["Januar–februar","Mars–april","Mai–juni","Juli–august","September–oktober","November–desember"];
const rates=[0,12,15,25];
export default function InvoiceVatTermClient(){
 const now=new Date();
 const [year,setYear]=useState(String(now.getFullYear()));
 const [term,setTerm]=useState(String(Math.ceil((now.getMonth()+1)/2)));
 const [chosen,setChosen]=useState({year:String(now.getFullYear()),term:String(Math.ceil((now.getMonth()+1)/2))});
 const [reload,setReload]=useState(0),[report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const parameters=new URLSearchParams({year:chosen.year,term:chosen.term});
 const query=parameters.toString(),url="/api/admin/invoices/vat-terms?"+query;
 useEffect(()=>{
  let active=true;setLoading(true);setError("");setReport(null);
  fetch(url,{cache:"no-store"}).then(async r=>{
   const d=await r.json();if(!r.ok)throw Error(d.error||"MVA-avstemmingen kunne ikke hentes.");
   if(active)setReport(d);
  }).catch(e=>{if(active)setError(e.message||"MVA-avstemmingen ble ikke hentet.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false};
 },[url,reload]);
 function choose(e){
  e.preventDefault();
  if(!/^\d{4}$/.test(year)||Number(year)<2000||Number(year)>2100){setError("Velg et gyldig år.");return;}
  setChosen({year,term});
 }
 const onDocumentSaved=({documentDate}={})=>{
  const target=vatDocumentPeriod(documentDate);
  if(target){setYear(String(target.year));setTerm(String(target.term));
   setChosen({year:String(target.year),term:String(target.term)});}
  setReload(n=>n+1);
 };
 const selectTerm=nextTerm=>{setTerm(String(nextTerm));setChosen({year:chosen.year,term:String(nextTerm)});};
 const total=report?.total;
 const settlement=report?vatSettlementPreview(report.comparison):null;
 return <main className="admin" style={{maxWidth:1200,margin:"0 auto",padding:24}}>
  <p><Link href="/admin/faktura/arkiv">← Tilbake til fakturaarkivet</Link></p>
  <p><Link href="/admin/faktura/systima">Systima: tilkoblingsstatus og API-oppsett</Link></p>
  <h1>MVA-avstemming – salgsdokumenter</h1>
  <p style={{display:"flex",gap:16,flexWrap:"wrap"}}>
   <a href="#mobilkvittering">Skann eller registrer kvittering</a>
   <a href="#eldre-kundefakturaer">Importer kundefaktura fra et tidligere system</a>
  </p>
  <p>Oversikt over <strong>utgående MVA</strong> fra salgsdokumenter og <strong>manuelt bekreftet inngående MVA</strong> fra leverandørbilag,
   fordelt etter dokumentdato. Innbetalingsdato og administrativ avslutning påvirker ikke terminen.</p>
  <section className="card" style={{padding:18,marginBottom:18}}>
   <h2>Velg MVA-termin</h2>
   <form onSubmit={choose} style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"end"}}>
    <label>År
     <input type="number" min="2000" max="2100" step="1" value={year} onChange={e=>setYear(e.target.value)}/>
    </label>
    <label>Termin
     <select value={term} onChange={e=>setTerm(e.target.value)}>
      {labels.map((name,index)=><option key={index} value={String(index+1)}>
       {index+1}. termin – {name}
      </option>)}
     </select>
    </label>
    <button type="submit" disabled={loading}>Vis termin</button>
    <button type="button" disabled={loading} onClick={()=>setReload(n=>n+1)}>Oppdater</button>
   </form>
   {report&&<p style={{fontSize:13,margin:"12px 0 0"}}>
    Dokumentdato: <strong>{report.period.from} til {report.period.to}</strong>.
   </p>}
  </section>
  {loading&&<p role="status">Kontrollerer alle fakturaer og kreditnotaer i terminen …</p>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error} Rapporttall vises ikke hvis grunnlaget er ufullstendig.</p>}
  {report&&!loading&&<>
   <VatReportingControlClient year={chosen.year} term={chosen.term}
    onChanged={()=>setReload(n=>n+1)} onSelectTerm={selectTerm}/>
   <VatSubmissionReviewClient year={chosen.year} term={chosen.term} revision={reload}/>
   <section className="card" aria-labelledby="vat-outcome-title"
    style={{padding:18,marginBottom:18,border:"2px solid #b5c5c3"}}>
    <h2 id="vat-outcome-title" style={{margin:"0 0 7px"}}>
     Hva ligger du an til i MVA? – {report.period.title}
    </h2>
    {settlement?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",
     gap:14,alignItems:"end",margin:"14px 0"}}>
     <div style={{padding:"8px 0"}}>
      <small style={{display:"block"}}>Utgående MVA fra registrerte salg</small>
      <strong>{money(report.comparison.outputVatOre)}</strong>
     </div>
     <div style={{padding:"8px 0"}}>
      <small style={{display:"block"}}>Registrert fradragsberettiget inngående MVA</small>
      <strong>{money(report.comparison.inputVatOre)}</strong>
     </div>
     <div style={{padding:"10px 0",borderTop:"2px solid currentColor"}}>
      <small style={{display:"block",fontWeight:700}}>{settlement.label}</small>
      <strong style={{display:"block",fontSize:"clamp(24px,5vw,34px)",lineHeight:1.2}}>
       {money(settlement.amountOre)}
      </strong>
     </div>
    </div>:<p role="alert">MVA-beløpet kan ikke beregnes trygt fra rapporten.</p>}
    <p style={{fontSize:13,background:"#f1f5f2",padding:12,borderRadius:10}}>
     <strong>Ubetalte fakturaer påvirker ikke når MVA skal meldes.</strong>
     {" "}For fakturaer laget i Aadland Service er det per nå <strong>{total.paymentSnapshot?.openCount??0}</strong> fakturaer
     med utestående beløp på <strong>{money(total.paymentSnapshot?.openGrossOre||0)}</strong> inkl. MVA.
     {" "}Dette er utestående fakturabeløp, ikke MVA-beløpet på de ubetalte fakturaene.
     {total.paymentSnapshot?.unknownCount>0?" Betalingsstatus mangler på noen fakturaer.":""}
     {" "}Betalingsstatus for eldre importerte fakturaer må kontrolleres i det gamle systemet.
    </p>
    <p style={{fontSize:13,lineHeight:1.55,marginBottom:0}}>
     <strong>Dette er bare en foreløpig beregning, ikke et betalingskrav eller en godkjent tilbakebetaling.</strong>
     {" "}Tallet er utgående MVA minus registrert fradragsberettiget inngående MVA
     i Aadland Service. Kjøp, salg og øvrige MVA-poster som bare ligger i regnskapssystemet,
     er ikke nødvendigvis med. Sammenlign med regnskapet og MVA-meldingen før du betaler eller
     forventer penger tilbake fra Skatteetaten.
    </p>
   </section>
   <div id="mobilkvittering"/>
   <InputVatRegisterClient purchases={report.purchases.rows} period={report.period}
    onChanged={onDocumentSaved}/>
   <ExternalVatSalesClient onChanged={onDocumentSaved}/>
   <section className="card" style={{padding:18,marginBottom:18}}>
    <h2>Utgående MVA – {report.period.title}</h2>
    <p style={{fontSize:13}}>Både betalte og ubetalte utstedte fakturaer er med. Betalingsstatusen nedenfor viser <strong>saldo per nå</strong>, ikke saldo da terminen sluttet.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
     {[
      ["Fakturaer (inkl. eldre import)",String(total.invoiceCount)],
      ["Kreditnotaer (inkl. eldre import)",String(total.creditCount)],
      ["Fakturert inkl. MVA",money(total.invoiceGrossOre)],
      ["Kreditert inkl. MVA",money(total.creditedGrossOre)],
      ["Netto omsetningsgrunnlag",money(total.baseOre)],
      ["Utgående MVA",money(total.vatOre)],
      ["Netto inkl. MVA",money(total.grossOre)]
     ].map(([label,value])=><div key={label} style={{padding:"8px 0",borderBottom:"1px solid #e5ded1"}}>
      <small style={{display:"block"}}>{label}</small><strong>{value}</strong>
     </div>)}
    </div>
    <h3 style={{marginTop:20}}>Fordeling etter MVA-sats</h3>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:480}}>
     <thead><tr><th scope="col">Sats</th><th scope="col" style={{textAlign:"right"}}>Netto grunnlag eks. MVA</th><th scope="col" style={{textAlign:"right"}}>Utgående MVA</th></tr></thead>
     <tbody>{rates.map(rate=><tr key={rate}><th scope="row">{rate} %</th>
      <td style={{textAlign:"right"}}>{money(total.vat[rate].baseOre)}</td>
      <td style={{textAlign:"right"}}>{money(total.vat[rate].vatOre)}</td></tr>)}</tbody>
    </table></div>
    <h3 style={{marginTop:20}}>Inngående MVA – kontrollert innkjøpsregister</h3>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12}}>
     {[
      ["Registrerte leverandørbilag",String(report.purchases.documentCount)],
      ["MVA på registrerte kjøpsbilag",money(report.purchases.vatOnPurchasesOre)],
      ["Vurdert fradragsberettiget inngående MVA",money(report.purchases.inputVatOre)],
      ["Utgående MVA fra fakturaer",money(report.comparison.outputVatOre)],
      ["Foreløpig differanse",money(report.comparison.differenceOre)]
     ].map(([label,value])=><div key={label} style={{padding:"8px 0",borderBottom:"1px solid #e5ded1"}}>
      <small style={{display:"block"}}>{label}</small><strong>{value}</strong>
     </div>)}
    </div>
    <p style={{fontSize:13}}><strong>Ikke beregnet betaling til Skatteetaten:</strong> {report.comparison.warning}</p>
    <h3>MVA fra registrerte innkjøp per sats</h3>
    <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:480}}>
     <thead><tr><th>Sats</th><th style={{textAlign:"right"}}>Grunnlag eks. MVA</th><th style={{textAlign:"right"}}>MVA på bilag</th></tr></thead>
     <tbody>{rates.map(rate=><tr key={rate}><th scope="row">{rate} %</th>
      <td style={{textAlign:"right"}}>{money(report.purchases.byRate[rate].baseOre)}</td>
      <td style={{textAlign:"right"}}>{money(report.purchases.byRate[rate].vatOre)}</td>
     </tr>)}</tbody>
    </table></div>
    <p style={{fontSize:13}}>
     <strong>Viktig:</strong> Dette er en avstemmingsrapport, ikke en ferdig MVA-melding.
     Innkjøpsregisteret er manuelt og inneholder bare bilag som er lagt inn her. Andre utgifter
     og omsetning fra andre systemer, 
     nødvendige MVA-koder for 0 %-omsetning eller særtilfeller med for sen fakturering.
     Sammenlign den med bokføringen før du leverer til Skatteetaten.
    </p>
    <a href={"/api/admin/invoices/vat-terms?"+query+"&format=csv"} download>
     Eksporter salgsdokumenter, innkjøpsbilag og foreløpig MVA-avstemming (CSV)
    </a>
   </section>
   <VatPurchaseCsvImport onChanged={()=>setReload(n=>n+1)}/>

   <section className="card" style={{padding:18}}>
    <h2>Salgsdokumentoversikt ({report.rows.length})</h2>
    <p style={{fontSize:13}}>Inkluderer fakturaer fra Aadland Service og kontrollert import fra eldre fakturasystemer.
     Eldre dokumenter har lenke til privat lagret originalfaktura.</p>
    {report.rows.length===0?<p>Ingen utstedte fakturaer eller kreditnotaer i denne terminen.</p>:
     <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:850}}>
      <thead><tr><th>Dato</th><th>Dokument</th><th>Kunde</th>
       <th style={{textAlign:"right"}}>Eks. MVA</th>
       <th style={{textAlign:"right"}}>MVA</th><th style={{textAlign:"right"}}>Inkl. MVA</th>
       <th style={{textAlign:"right"}}>Utestående nå</th></tr></thead>
      <tbody>{report.rows.map(row=><tr key={row.key}>
       <td>{row.documentDate}</td>
       <td>{row.externalDocumentId
       ?<a href={"/api/admin/invoices/vat-external-files?documentId="+encodeURIComponent(row.externalDocumentId)+"&download=1"}
        title="Last ned originalfaktura fra tidligere fakturasystem">{row.documentNumber}</a>
       :<Link href={"/admin/faktura/arkiv?id="+encodeURIComponent(row.invoiceId)}>
        {row.documentNumber}</Link>}
        <small style={{display:"block"}}>{row.kindLabel}
         {row.invoiceNumberReference?" · Gjelder "+row.invoiceNumberReference:""}
         {row.sourceSystem?" · "+row.sourceSystem:""}</small>
       </td>
       <td>{row.customerName}</td>
       <td style={{textAlign:"right"}}>{money(row.baseOre)}</td>
       <td style={{textAlign:"right"}}>{money(row.vatOre)}</td>
       <td style={{textAlign:"right"}}>{money(row.totalOre)}</td>
       <td style={{textAlign:"right"}}>{row.outstandingOre===null||row.outstandingOre===undefined?"Ikke kjent":money(row.outstandingOre)}</td>
      </tr>)}</tbody>
     </table></div>}
   </section>
  </>}
 </main>;
}
