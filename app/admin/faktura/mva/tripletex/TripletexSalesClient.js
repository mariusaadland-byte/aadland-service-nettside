"use client";
import {useCallback,useEffect,useState} from "react";
import styles from "./TripletexReceipts.module.css";
const base="/api/admin/invoices/tripletex/sales";
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(n||0)/100);
const moneyKind=s=>s==="unpaid"?"Klar for ubetalt fakturaimport":
 s==="paid"?"Har betalinger – krever betalingsoppsett":s==="review"?"Kontroller før import":"Ikke utstedt";
const url=(format,startNumber,includePaid,paymentTypeVipps,paymentTypeOther)=>{
 const query=new URLSearchParams({format,startNumber:String(startNumber)});
 if(includePaid){query.set("includePaid","1");query.set("paymentTypeVipps",paymentTypeVipps.trim());query.set("paymentTypeOther",paymentTypeOther.trim());}
 return base+"?"+query.toString();
};
export default function TripletexSalesClient(){
 const [rows,setRows]=useState([]),[summary,setSummary]=useState(null);
 const [error,setError]=useState(""),[loading,setLoading]=useState(true);
 const [startNumber,setStartNumber]=useState("80000000");
 const [includePaid,setIncludePaid]=useState(false);
 const [paymentTypeVipps,setPaymentTypeVipps]=useState(""),[paymentTypeOther,setPaymentTypeOther]=useState("");
 const [ack,setAck]=useState(false);
 const chosenNumber=Number(startNumber),numberValid=Number.isSafeInteger(chosenNumber)&&
  chosenNumber>=10001&&chosenNumber<=999999000;
 const needsVipps=rows.some(r=>r.state==="paid"&&r.paymentSource==="vipps");
 const needsOther=rows.some(r=>r.state==="paid"&&r.paymentSource==="other");
 const validType=value=>/^[A-Za-z0-9_-]{1,32}$/.test(value.trim());
 const paidValid=!includePaid||(!needsVipps||validType(paymentTypeVipps))&&
  (!needsOther||validType(paymentTypeOther));
 const downloadAllowed=numberValid&&paidValid&&ack;
 const load=useCallback(async()=>{
  const response=await fetch(base,{cache:"no-store"});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||"Kunne ikke hente sendte fakturaer.");
  setSummary(result.summary);setRows(result.rows||[]);
 },[]);
 useEffect(()=>{let active=true;load().catch(e=>{if(active)setError(e.message)})
  .finally(()=>{if(active)setLoading(false)});return()=>{active=false};},[load]);
 const downloadable=rows.filter(r=>r.state==="unpaid"||
  includePaid&&r.state==="paid").length;
 const link=(format)=>url(format,startNumber,includePaid,paymentTypeVipps,paymentTypeOther);
 return <section className={styles.section} style={{marginBottom:24}}>
  <h2 style={{fontSize:22,marginBottom:8}}>Utgående fakturaer – allerede sendt fra appen</h2>
  <p className={styles.hint}>Ta med fakturanummer, kunder, dato, beløp, ordrelinjer og MVA til Tripletex.
   Dette er fakturaer som allerede er sendt. De skal ikke sendes til kundene på nytt.</p>
  {loading&&<p role="status">Henter fakturahistorikken …</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {summary&&<>
   <div className={styles.stats}>
    <div className={styles.stat}><strong>{summary.total}</strong><span>Sendte fakturaer</span></div>
    <div className={styles.stat}><strong>{summary.unpaid}</strong><span>Ubetalte, klare til kontroll</span></div>
    <div className={styles.stat}><strong>{summary.paid}</strong><span>Med registrert betaling</span></div>
   </div>
   <div style={{borderTop:"1px solid #e6dfd5",paddingTop:15,marginTop:14}}>
    <h3 style={{fontSize:17,margin:"0 0 8px"}}>1. Last ned alle fakturaene</h3>
    <p className={styles.hint}>To filer gir deg en samlet sikkerhetskopi: original-PDF-ene
     i én ZIP-fil og fullstendig faktura- og betalingsoversikt som CSV.</p>
    <div className={styles.actions}>
     <a className={styles.link} href={url("pdfzip",startNumber,false,"","")}>Last ned alle originale faktura-PDF-er (ZIP)</a>
     <a className={styles.link} href={url("archive",startNumber,false,"","")}>Last ned alle faktura- og betalingsopplysninger (CSV)</a>
    </div>
   </div>
   <div style={{borderTop:"1px solid #e6dfd5",paddingTop:16,marginTop:12}}>
    <h3 style={{fontSize:17,margin:"0 0 8px"}}>2. Lag fakturaimport til Tripletex</h3>
    <p className={styles.hint}>Tripletex bruker en egen numerisk importserie.
     Dine opprinnelige fakturanumre ligger uendret i Aadland Service og PDF-ene,
     og følger med som referanse i importen. Importerte fakturaer blir ikke sendt til kunden.</p>
    <div className={styles.inputs}>
     <label>Første ledige importnummer
      <input type="number" min="10001" max="999999000" step="1" value={startNumber}
       onChange={e=>{setStartNumber(e.target.value);setAck(false);}}/>
     </label>
    </div>
    {!numberValid&&<p className={styles.error}>Skriv inn et gyldig numerisk startnummer.</p>}
    <label className={styles.check}><input type="checkbox" checked={includePaid}
     onChange={e=>{setIncludePaid(e.target.checked);setAck(false);}}/>
     <span>Ta også med fakturaer som er betalt eller delbetalt.</span>
    </label>
    {includePaid&&<div>
     <div className={styles.inputs}>
      {needsVipps&&<label>Vipps – betalingstype «Import-ID»
       <input type="text" autoComplete="off" placeholder="Import-ID for Vipps"
        value={paymentTypeVipps} maxLength={32}
        onChange={e=>{setPaymentTypeVipps(e.target.value);setAck(false);}}/>
      </label>}
      {needsOther&&<label>Andre/bank – betalingstype «Import-ID»
       <input type="text" autoComplete="off" placeholder="Import-ID for annen innbetaling"
        value={paymentTypeOther} maxLength={32}
        onChange={e=>{setPaymentTypeOther(e.target.value);setAck(false);}}/>
      </label>}
     </div>
     <p className={styles.hint}>Finn betalingsformene i
      <strong> Regnskap → Innstillinger → Betalingstyper</strong> i Tripletex.
      Vipps og manuelle innbetalinger må bruke riktige, separate kontoer.
      Dersom en faktura har flere betalingsmåter eller uklart oppgjør, stoppes den for kontroll.</p>
    </div>}
    <p className={styles.hint}><strong>{downloadable}</strong> av {summary.total} sendte fakturaer
     blir tatt med i den valgte importen.
     {summary.needsReview>0&&" "+summary.needsReview+" fakturaer trenger egen kontroll."}</p>
    <label className={styles.check}><input type="checkbox" checked={ack}
     onChange={e=>setAck(e.target.checked)}/>
     <span>Jeg har kontrollert at importnumrene ikke er brukt i Tripletex, at
      fakturaene ikke allerede er bokført der, og at konto/MVA og eventuelle betalinger
      blir kontrollert før jeg gjennomfører importen.</span>
    </label>
    <div className={styles.actions}>
     {downloadAllowed&&downloadable>0?
      <a className={styles.primary} style={{textDecoration:"none",display:"inline-flex",alignItems:"center"}}
       href={link("tripletex")}>Last ned Tripletex-import ({downloadable} fakturaer)</a>:
      <button type="button" className={styles.primary} disabled>
       Last ned Tripletex-import ({downloadable} fakturaer)
      </button>}
    </div>
    <p className={styles.hint}>Åpne deretter <strong>Faktura → Import/eksport → Fakturaimport</strong>
     i Tripletex, velg CSV og last opp filen. <strong>Ikke</strong> huk av «Beløp inkl. mva»,
     siden eksporten bruker nettopris på hver linje. Kontroller forhåndsvisning og summer.
     Ingen data overføres eller bokføres bare ved at du laster ned CSV-filen.</p>
   </div>
   <div style={{marginTop:18}}>
    <details>
     <summary style={{cursor:"pointer",fontWeight:700}}>Se alle sendte fakturaer og status ({summary.total})</summary>
     <div className={styles.list}>{rows.map(r=><div key={r.id} className={styles.item}>
      <div className={styles.itemInfo}>
       <strong>{r.originalNumber} · {r.customerName}</strong>
       <small>{r.issuedDate} · {money(r.grossOre)} · Betalt {money(r.paidOre)} · Gjenstår {money(r.outstandingOre)}</small>
       <small className={styles.status}>{moneyKind(r.state)}. {r.reason}{r.paymentSource==="vipps"?" (Vipps)":r.paymentSource==="other"?" (Annen/bank)":""}</small>
       <small>Foreslått importnummer: {numberValid?chosenNumber+rows.findIndex(x=>x.id===r.id):"–"}</small>
      </div>
      <div className={styles.itemLinks}>
       {r.hasPdf&&<a href={"/api/admin/invoices/pdf?id="+encodeURIComponent(r.id)}>Original-PDF</a>}
      </div>
     </div>)}</div>
    </details>
   </div>
  </>}
 </section>;
}
