"use client";
import {invoiceFollowUpSummary} from "../../../lib/invoiceFollowUpState";
const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format((Number(ore)||0)/100);
export default function InvoiceFollowUpDashboard({invoices,today,activeFilter,onFilterChange,loading}){
 const stats=invoiceFollowUpSummary(invoices,today);
 const groups=[
  {key:"attention",label:"Må følges opp",count:stats.actionCount,
   description:"Forfalte fakturaer og saker som må kontrolleres"},
  {key:"ready",label:"Klar for avslutning",count:stats.readyCount,
   description:"Økonomisk oppgjort – klart for en siste administrativ gjennomgang"},
  {key:"awaiting",label:"Venter på betaling",count:stats.notDueCount,
   description:"Utstedte fakturaer som ikke er forfalt eller trenger kontroll"}
 ];
 return <section className="card" style={{padding:18,marginBottom:20}}>
  <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginBottom:14}}>
   <div>
    <h2 style={{margin:"0 0 5px"}}>Fakturaer som trenger oppfølging</h2>
    <p className="muted" style={{margin:0,fontSize:13}}>Se hva som er økonomisk ferdig og hva som gjenstår å følge opp.</p>
   </div>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}>
   {groups.map(group=><button type="button" key={group.key}
    disabled={loading} onClick={()=>onFilterChange(group.key)}
    aria-pressed={activeFilter===group.key}
    style={{padding:14,borderRadius:10,textAlign:"left",whiteSpace:"normal",
     border:activeFilter===group.key?"2px solid #aa8240":"1px solid #d9cdbb",
     background:activeFilter===group.key?"#f1e7d6":"#fff",color:"#211b14"}}>
    <span style={{fontSize:13,display:"block"}}>{group.label}</span>
    <strong style={{display:"block",fontSize:27,margin:"6px 0"}}>{group.count}</strong>
    <small style={{display:"block",lineHeight:1.4}}>{group.description}</small>
   </button>)}
  </div>
  <p style={{fontSize:13,margin:"14px 0 5px"}}>
   <strong>Må kontrolleres:</strong> {stats.reviewCount} ·
   <strong> Forfalt:</strong> {stats.overdueCount} ·
   <strong> Forfaller snart:</strong> {stats.dueSoonCount}
  </p>
  {stats.actionCount>0&&<p style={{fontSize:13,margin:"5px 0"}}>
   Utestående beløp på saker som krever oppfølging: <strong>{money(stats.actionOutstandingOre)}</strong>
  </p>}
  <p className="muted" style={{fontSize:12,margin:"12px 0 0"}}>
   «Klar for avslutning» betyr at fakturaen er økonomisk oppgjort og ingen kjente betalingsavvik er registrert.
   Det lukker ikke fakturaen eller endrer regnskapet. Kontroller dokumentasjon før administrativ avslutning.
  </p>
 </section>;
}
