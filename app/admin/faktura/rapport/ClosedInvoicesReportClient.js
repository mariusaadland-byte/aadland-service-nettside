"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(ore)||0)/100);
const rates=[0,12,15,25];
export default function ClosedInvoicesReportClient(){
 const [from,setFrom]=useState(""),[to,setTo]=useState("");
 const [selectedFrom,setSelectedFrom]=useState(""),[selectedTo,setSelectedTo]=useState("");
 const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const query=()=>{
  const p=new URLSearchParams();
  if(selectedFrom)p.set("from",selectedFrom);
  if(selectedTo)p.set("to",selectedTo);
  return p.toString();
 };
 const q=query();
 const base="/api/admin/invoices/closed-report";
 const reportUrl=base+(q?"?"+q:"");
 const csvUrl=base+"?"+(q?q+"&":"")+"format=csv";
 useEffect(()=>{
  let active=true;setLoading(true);setReport(null);setError("");
  fetch(reportUrl,{cache:"no-store"})
   .then(async response=>{
    const data=await response.json();
    if(!response.ok)throw Error(data.error||"Rapporten kunne ikke hentes.");
    if(active)setReport(data);
   })
   .catch(e=>{if(active)setError(e.message||"Rapporten er utilgjengelig.");})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[reportUrl]);
 function apply(event){
  event.preventDefault();
  if(from&&to&&from>to){setError("Fra-dato kan ikke være etter til-dato.");return;}
  setSelectedFrom(from);setSelectedTo(to);
 }
 const total=report?.total;
 return <main className="admin" style={{maxWidth:1200,margin:"auto",padding:24}}>
  <Link href="/admin/faktura/arkiv">← Tilbake til fakturaarkivet</Link>
  <h1>Rapport over avsluttede fakturaer</h1>
  <p>Viser fakturaer som <strong>fortsatt er administrativt avsluttet</strong>.
   Filtrer etter datoen de ble avsluttet, og eksporter samme tall som CSV til Excel eller regnskapskontroll.</p>
  <section className="card" style={{padding:18,marginBottom:20}}>
   <h2>Velg tidsrom</h2>
   <form onSubmit={apply} style={{display:"flex",gap:12,alignItems:"end",flexWrap:"wrap"}}>
    <label>Fra avslutningsdato
     <input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/>
    </label>
    <label>Til avslutningsdato
     <input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/>
    </label>
    <button type="submit" disabled={loading}>Vis rapport</button>
    <button type="button" disabled={loading} onClick={()=>{setFrom("");setTo("");setSelectedFrom("");setSelectedTo("");}}>
     Vis alle datoer
    </button>
   </form>
   <p className="muted" style={{fontSize:12,margin:"10px 0 0"}}>
    Datoene tolkes som kalenderdager i Norge. En faktura som åpnes igjen, forsvinner fra listen over avsluttede fakturaer.
   </p>
  </section>
  {loading&&<p role="status">Kontrollerer avsluttede fakturaer og MVA-grunnlag …</p>}
  {error&&<p role="alert" style={{color:"#a52a21"}}>{error} Ingen ufullstendige rapporttall vises.</p>}
  {report&&!loading&&<>
   <section className="card" style={{padding:18,marginBottom:18}}>
    <h2>Oppsummering</h2>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14}}>
     {[
      ["Avsluttede fakturaer",String(total.count)],
      ["Opprinnelig inkl. MVA",money(total.grossOre)],
      ["Kreditert inkl. MVA",money(total.creditOre)],
      ["Etter kreditering eks. MVA",money(total.netSaleOre)],
      ["MVA etter kreditering",money(total.netVatOre)],
      ["Netto innbetalt",money(total.paidOre)]
     ].map(([label,value])=><div key={label} style={{borderBottom:"1px solid #e6ded1",padding:"8px 0"}}>
      <small style={{display:"block"}}>{label}</small>
      <strong>{value}</strong>
     </div>)}
    </div>
    <h3 style={{marginTop:20}}>MVA fordelt på sats</h3>
    <div style={{overflowX:"auto"}}>
     <table style={{width:"100%",borderCollapse:"collapse",minWidth:450}}>
      <thead><tr><th scope="col">MVA-sats</th><th scope="col" style={{textAlign:"right"}}>Grunnlag eks. MVA</th><th scope="col" style={{textAlign:"right"}}>MVA</th></tr></thead>
      <tbody>{rates.map(rate=><tr key={rate}>
       <th scope="row">{rate} %</th>
       <td style={{textAlign:"right"}}>{money(total.vat[rate].netOre)}</td>
       <td style={{textAlign:"right"}}>{money(total.vat[rate].vatOre)}</td>
      </tr>)}</tbody>
     </table>
    </div>
    <p style={{fontSize:13,marginTop:14}}>
     <strong>Merk:</strong> Dette er en intern rapport basert på administrativ avslutningsdato.
     Den er <strong>ikke en MVA-melding</strong> eller dokumentasjon for hvilken MVA-termin salget tilhører.
     Ved MVA-rapportering må fakturadato, kreditnotadato og regnskap avstemmes separat.
    </p>
    <a href={csvUrl} download style={{display:"inline-block",marginTop:6,fontWeight:700}}>
     Eksporter rapport til CSV (Excel)
    </a>
   </section>
   <section className="card" style={{padding:18}}>
    <h2>Fakturaer ({total.count})</h2>
    {report.rows.length===0?<p>Ingen administrativt avsluttede fakturaer i det valgte tidsrommet.</p>:
     <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",minWidth:950,borderCollapse:"collapse"}}>
       <thead><tr>
        <th scope="col">Faktura</th><th scope="col">Kunde</th><th scope="col">Avsluttet</th>
        <th scope="col" style={{textAlign:"right"}}>Eks. MVA</th>
        <th scope="col" style={{textAlign:"right"}}>MVA</th>
        <th scope="col" style={{textAlign:"right"}}>Inkl. MVA</th>
        <th scope="col" style={{textAlign:"right"}}>Kreditert</th>
        <th scope="col" style={{textAlign:"right"}}>Innbetalt</th>
       </tr></thead>
       <tbody>{report.rows.map(row=><tr key={row.id}>
        <td><Link href={"/admin/faktura/arkiv?id="+encodeURIComponent(row.id)}>{row.invoiceNumber}</Link></td>
        <td>{row.customerName}</td><td>{row.closedOn}</td>
        <td style={{textAlign:"right"}}>{money(row.netSaleOre)}</td>
        <td style={{textAlign:"right"}}>{money(row.netVatOre)}</td>
        <td style={{textAlign:"right"}}>{money(row.netGrossOre)}</td>
        <td style={{textAlign:"right"}}>{money(row.creditOre)}</td>
        <td style={{textAlign:"right"}}>{money(row.paidOre)}</td>
       </tr>)}</tbody>
      </table>
     </div>}
   </section>
  </>}
 </main>;
}
