"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import styles from "./AccountingOverview.module.css";
import TripletexReceiptsClient from "../faktura/mva/tripletex/TripletexReceiptsClient";
import TripletexSalesClient from "../faktura/mva/tripletex/TripletexSalesClient";
import TripletexApiConnectClient from "../faktura/mva/tripletex/TripletexApiConnectClient";
const views={oversikt:"Oversikt",betalt:"Betalte fakturaer",ubetalt:"Ubetalte fakturaer",bilag:"Utgifter",mva:"MVA",regnskapsark:"Regnskapsark",overforinger:"Tripletex-overføringer"};
const kroner=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(n||0)/100);
const currentYear=()=>new Intl.DateTimeFormat("en-GB",{year:"numeric",timeZone:"Europe/Oslo"}).format(new Date());
const transferStatus=v=>v==="accepted"?"Akseptert av e-posttjenesten":v==="sending"?"Under sending":v==="needs_review"?"Må kontrolleres":"Ikke overført";
export default function AccountingOverviewClient({initialView="oversikt"}){
 const [view,setView]=useState(views[initialView]?initialView:"oversikt");
 const [year,setYear]=useState(currentYear);
 const [yearField,setYearField]=useState(currentYear);
 const [data,setData]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState("");
 const [filter,setFilter]=useState("");
 const change=next=>{setView(next);setFilter("");window.history.replaceState(null,"","/admin/regnskap?vis="+next)};
 const load=useCallback(async()=>{
  setBusy(true);setData(null);setError("");
  try{
   const response=await fetch("/api/admin/regnskap?year="+year,{cache:"no-store"});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||"Kunne ikke hente regnskapstall.");
   setData(result);
  }catch(e){setError(e.message);}finally{setBusy(false);}
 },[year]);
 useEffect(()=>{load();},[load]);
 const period=e=>{e.preventDefault();
  if(/^\d{4}$/.test(yearField)&&Number(yearField)>=2000&&Number(yearField)<=2100)setYear(yearField);
  else setError("Velg et gyldig regnskapsår.");
 };
 const t=data?.total||{};
 const find=(...str)=>!filter.trim()||str.some(x=>String(x||"").toLocaleLowerCase("nb-NO").includes(filter.trim().toLocaleLowerCase("nb-NO")));
 const sales=(data?.sales||[]).filter(x=>
  (view==="betalt"?x.paymentStatus==="paid":view==="ubetalt"?x.outstandingOre>0:true)&&find(x.customer,x.number));
 const expenses=(data?.expenses||[]).filter(x=>find(x.supplier,x.number));
 const transfers=(data?.transfers||[]).filter(x=>find(x.supplier,x.number,x.state));
 const ledger=(data?.ledger||[]).filter(x=>find(x.name,x.ref,x.kind));
 const metric=(label,value,details)=> <div className={styles.metric} key={label}>
  <span>{label}</span><strong>{value}</strong>{details&&<small>{details}</small>}
 </div>;
 const button=(next,label)=><button type="button" className={styles.link} onClick={()=>change(next)}>{label}</button>;
 const link=(href,label)=><Link className={styles.link} href={href}>{label}</Link>;
 const block=(name,children)=><section className={styles.section}><h2>{name}</h2>{children}</section>;
 return <div className={styles.shell}>
  <header className={styles.hero}>
   <div><h1>Regnskap</h1><p className={styles.intro}>Samlet oversikt over fakturaer, innbetalinger, utgifter, MVA og overføring til Tripletex. En intern kontrolloversikt, ikke et ferdig bokført regnskap.</p></div>
   <form className={styles.year} onSubmit={period}><label>Regnskapsår
    <input type="number" min="2000" max="2100" value={yearField} onChange={e=>setYearField(e.target.value)}/>
    </label><button type="submit" disabled={busy}>Vis år</button></form>
  </header>
  <nav className={styles.tabs} aria-label="Regnskapsmeny">
   {Object.entries(views).map(([key,title])=><button type="button" key={key} className={styles.tab} aria-current={view===key?"page":undefined} onClick={()=>change(key)}>{title}</button>)}
  </nav>
  {busy&&<p role="status">Henter regnskapstall for {year} …</p>}
  {error&&<p className={styles.error} role="alert">{error} Ingen ufullstendige tall vises.</p>}
  {data&&!busy&&<>
   {["betalt","ubetalt","bilag","regnskapsark","overforinger"].includes(view)&&
    <label style={{display:"grid",gap:5,fontSize:12,maxWidth:370,marginBottom:20,fontWeight:700}}>Søk i oversikten
     <input value={filter} onChange={e=>setFilter(e.target.value)} type="search" placeholder="Kunde, leverandør eller nummer"
      style={{background:"white",minHeight:42,padding:"9px 12px",border:"1px solid #cfc8bf",borderRadius:9,color:"#24221f"}}/>
    </label>}
   {view==="oversikt"&&<>
    <div className={styles.metrics}>
     {metric("Fakturert inkl. MVA",kroner(t.invoicedGrossOre),t.issuedCount+" sendte fakturaer")}
     {metric("Registrert betalt på årets fakturaer",kroner(t.recordedPaidOnInvoicesOre),"Kan være betalt i et annet år")}
     {metric("Utestående",kroner(t.outstandingOre),t.unpaidCount+" helt eller delvis ubetalte")}
     {metric("Registrerte kjøpsbilag",kroner(t.expenseGrossOre),t.purchasesCount+" bilag – ikke nødvendigvis betalt")}
    </div>
    {block("Fakturaer og betaling",<>
     <p className={styles.intro}>{t.paidCount} betalte fakturaer, {t.unpaidCount} med utestående beløp.</p>
     <div className={styles.actions}>{button("betalt","Se betalte fakturaer")}{button("ubetalt","Se ubetalte fakturaer")}{link("/admin/faktura/arkiv","Fakturaarkiv")}</div>
    </>)}
    {block("MVA og utgifter",<>
     <p className={styles.intro}>Foreløpig utgående MVA: {kroner(t.outputVatOre)}. Foreslått inngående MVA-fradrag: {kroner(t.inputVatProposedOre)}.</p>
     <div className={styles.actions}>{button("mva","Se MVA")}{button("bilag","Se leverandørbilag")}{link("/admin/faktura/mva#mobilkvittering","Registrer kvittering")}</div>
    </>)}
    {block("Tripletex-overføring",<>
     <p className={styles.intro}>{t.transfersNotSent} kvitteringer ikke sendt, {t.transfersAccepted} akseptert av e-posttjenesten, {t.transfersReview} må kontrolleres.</p>
     <div className={styles.actions}>{button("overforinger","Se overføringslisten")}{link("/admin/faktura/mva/tripletex","Åpne Tripletex")}</div>
    </>)}
    {block("Regnskapsark",<div className={styles.actions}>{button("regnskapsark","Se alle registreringer")}{link("/api/admin/regnskap?year="+year+"&format=csv","Last ned CSV")}</div>)}
   </>}
   {(view==="betalt"||view==="ubetalt")&&block(views[view]+" · "+sales.length,<>
    <p className={styles.intro}>Fakturaer utstedt i {year}, med registrert betalingsstatus. Se fakturaarkivet for betaling og kreditnota.</p>
    <div className={styles.rows}>{sales.map(x=><div key={x.id} className={styles.row}>
     <span>{x.date}</span><div className={styles.desc}><strong>{x.customer}</strong><small>{x.number}</small></div>
     <span className={styles.pill}>{x.paymentLabel}</span><div className={styles.amount}>
      {kroner(x.grossOre)}<small>Betalt {kroner(x.paidOre)} · Rest {kroner(x.outstandingOre)}</small>
     </div>
    </div>)}{!sales.length&&<p className={styles.empty}>Ingen fakturaer i dette utvalget.</p>}</div>
    <div className={styles.actions}>{link("/admin/faktura/arkiv","Åpne fakturaarkivet")}</div>
   </>)}
   {view==="bilag"&&block("Utgifter og leverandørbilag · "+expenses.length,<>
    <p className={styles.intro}>Viser bilag som er registrert i appen. Ikke alle utgifter eller betalte regnskapsposter fra Tripletex.</p>
    <div className={styles.rows}>{expenses.map(x=><div className={styles.row} key={x.id}>
     <span>{x.date}</span><div className={styles.desc}><strong>{x.supplier}</strong><small>{x.number} · {x.kind==="credit"?"Kreditnota":"Kjøpsbilag"}</small></div>
     <span className={styles.pill}>{x.hasAttachment?"Original lagret":"Original mangler"}</span>
     <div className={styles.amount}>{kroner(x.grossOre)}<small>Fradragsforslag {kroner(x.deductibleOre)}</small></div>
    </div>)}{!expenses.length&&<p className={styles.empty}>Ingen kjøpsbilag for {year}.</p>}</div>
    <div className={styles.actions}>{link("/admin/faktura/mva#mobilkvittering","Registrer kvittering")}</div>
   </>)}
   {view==="mva"&&block("MVA – foreløpig oversikt for "+year,<>
    <div className={styles.metrics}>
     {metric("Utgående MVA fra fakturaer",kroner(t.outputVatOre))}
     {metric("Inngående MVA – foreslått fradrag",kroner(t.inputVatProposedOre))}
     {metric("Foreløpig differanse",kroner(t.vatDifferenceIndicativeOre),"Ikke en MVA-melding")}
     {metric("Registrerte kjøpsbilag",t.purchasesCount)}
    </div>
    <p className={styles.intro}>Denne årssummen er ikke periodisert eller avstemt mot Tripletex. Bruk MVA-siden for terminer og dokumentasjon.</p>
    <div className={styles.actions}>{link("/admin/faktura/mva#mva-oversikt","Åpne MVA-terminer")}{link("/admin/faktura/mva#mobilkvittering","Legg inn kvittering")}</div>
   </>)}
   {view==="regnskapsark"&&block("Regnskapsark · "+year,<>
    <p className={styles.intro}>Tidslinje for kundefakturaer, kjøpsbilag og innbetalinger. Innbetalinger har egen kolonne og er ikke nytt salg.</p>
    <div className={styles.actions}>{link("/api/admin/regnskap?year="+year+"&format=csv","Last ned regnskapsark (CSV)")}{link("/admin/faktura/mva/tripletex","Tripletex-overføring")}</div>
    <div className={styles.tableWrap}><table className={styles.ledger}>
     <thead><tr><th>Dato</th><th>Type</th><th>Kunde / leverandør</th><th>Referanse</th><th className={styles.right}>Fakturert</th><th className={styles.right}>Kjøpsbilag</th><th className={styles.right}>Innbetalt</th></tr></thead>
     <tbody>{ledger.map(x=><tr key={x.key}><td>{x.date}</td><td>{x.kind}</td><td>{x.name}</td><td>{x.ref}</td>
      <td className={styles.right}>{x.salesOre?kroner(x.salesOre):"–"}</td>
      <td className={styles.right}>{x.expenseOre?kroner(x.expenseOre):"–"}</td>
      <td className={styles.right}>{x.receivedOre?kroner(x.receivedOre):"–"}</td>
     </tr>)}</tbody>
    </table>{!ledger.length&&<p className={styles.empty}>Ingen registreringer.</p>}</div>
   </>)}
   {view==="overforinger"&&block("Tripletex – overføringsliste",<>
    <p className={styles.intro}>Her finner du både kundefakturaer og leverandørbilag som gjenstår. Ferdig importerte kundefakturaer ligger i historikken; kvitteringer flyttes når e-postleverandøren har akseptert sendingen.</p>
    <div style={{marginTop:20}}><TripletexApiConnectClient/></div>
    <div style={{marginTop:20}}><TripletexSalesClient/></div>
    <div style={{marginTop:28,borderTop:"2px solid #e3ddd3",paddingTop:15}}><TripletexReceiptsClient/></div>
   </>)}
      <div className={styles.warning}>{data.warnings.map((s,i)=><p key={i}>{s}</p>)}</div>
  </>}
 </div>;
}
