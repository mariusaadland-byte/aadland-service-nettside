import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../lib/auth";
import {db} from "../../../lib/supabase";
import ServiceReminderReviewClient from "./ServiceReminderReviewClient";
import {
 SERVICE_CRON_JOBS,SERVICE_CRON_FIRST_COMPLETE_DAY,serviceCronDailyStatus
} from "../../../lib/serviceCronMonitor";

export const dynamic="force-dynamic";
const displayTime=value=>{
 if(!value)return "Ikke registrert";
 const d=new Date(value);if(!Number.isFinite(d.getTime()))return "Ukjent tidspunkt";
 return new Intl.DateTimeFormat("nb-NO",{
  dateStyle:"short",timeStyle:"short",timeZone:"Europe/Oslo"
 }).format(d);
};
const style={
 main:{maxWidth:1050,margin:"0 auto",padding:"30px 18px 72px",color:"#24201b"},
 surface:{background:"#fff",border:"1px solid #ddd3c5",borderRadius:13,padding:18,marginTop:16},
 row:{padding:"16px 0",borderBottom:"1px solid #eee8de",display:"grid",
      gridTemplateColumns:"repeat(auto-fit,minmax(min(180px,100%),1fr))",gap:12,alignItems:"start"},
 muted:{fontSize:13,lineHeight:1.55,color:"#51483f",margin:"5px 0 0"},
 status:{display:"inline-block",borderRadius:6,padding:"6px 10px",fontWeight:750,fontSize:13}
};
const labels={
 ok:"Siste kjøring OK",warning:"Krever gjennomgang",failed:"Feilet",missing:"Ingen kjøring registrert",
 running:"Kjører / ikke ferdig",starting:"Venter på oppstart"
};
const colors={
 ok:{background:"#e5f2e6",color:"#28552d"},
 warning:{background:"#fff1d9",color:"#633b0a"},
 failed:{background:"#fbe8e5",color:"#84271e"},
 missing:{background:"#fbe8e5",color:"#84271e"},
 running:{background:"#e8edf5",color:"#273c5d"},
 starting:{background:"#eeeae2",color:"#514a3c"}
};
export default async function ServiceOperationsPage(){
 const admin=await getAdminUser();
 if(!admin)redirect("/admin/login");
 if(admin.role!=="owner")redirect("/admin");
 const s=db();
 let error="",rows=[],alerts=[];
 if(!s)error="Databasetilkobling mangler. Ingen driftsstatus kan bekreftes.";
 else{
  const [r,a]=await Promise.all([
   s.from("service_cron_runs")
    .select("job_key,state,detail,started_at,finished_at,http_status")
    .order("started_at",{ascending:false}).limit(500),
   s.from("service_cron_alert_batches")
    .select("alert_day,state,issue_count,created_at,sent_at")
    .order("alert_day",{ascending:false}).limit(7)
  ]);
  if(r.error||a.error)error="Driftsdataene kunne ikke leses fullstendig. Kontroller Supabase og deploy.";
  else{rows=r.data||[];alerts=a.data||[];}
 }
 const day=new Date().toISOString().slice(0,10);
 const health=error?[]:SERVICE_CRON_JOBS.map(job=>serviceCronDailyStatus(job,rows,day));
 const problems=health.filter(x=>["failed","missing","warning"].includes(x.state)).length;
 return <main style={style.main}>
  <p style={{margin:"0 0 16px",fontSize:14}}><Link href="/admin">Admin</Link> / Driftskontroll</p>
  <h1 style={{fontSize:"clamp(27px,5vw,37px)",lineHeight:1.16,margin:"0 0 8px"}}>Drift – Aadland Service</h1>
  <p style={style.muted}>Eierbeskyttet, skrivebeskyttet oversikt over planlagte Service-jobber. Her kjøres ingen jobber, fakturaer, betalinger eller kundemeldinger.</p>
  <div style={style.surface}>
   <h2 style={{fontSize:20,margin:"0 0 8px"}}>Automatiske kjøringer</h2>
   <p style={style.muted}>Dagens kontroll gjelder UTC-datoen <strong>{day}</strong>. Vercel kjører tidene i UTC. Tidspunktene nedenfor vises i norsk tid.</p>
   {day<SERVICE_CRON_FIRST_COMPLETE_DAY&&<p role="status" style={{padding:12,background:"#fff4df",color:"#613d17",borderRadius:9}}>
    Kontrollsystemet har nettopp blitt etablert. Første hele driftsdag som skal vurderes er <strong>{SERVICE_CRON_FIRST_COMPLETE_DAY}</strong>. Manglende historikk før denne datoen er ikke bevis for at eldre jobber ikke kjørte.
   </p>}
   {error&&<p role="alert" style={{padding:12,background:"#f9e8e6",color:"#8c2e26",borderRadius:9}}>{error}</p>}
   {!error&&day>=SERVICE_CRON_FIRST_COMPLETE_DAY&&<p role="status" style={style.muted}>
     {problems?problems+" av "+health.length+" jobber krever gjennomgang.":"Ingen feil eller manglende kjøringer registrert for dagens overvåkede Service-jobber."}
     {" "}Dette er ikke bevis på at hver kunde-e-post er levert.
   </p>}
   {health.map(item=><div key={item.key} style={style.row}>
    <div>
     <strong>{item.label}</strong>
     <p style={style.muted}>Planlagt {item.schedule} daglig</p>
    </div>
    <div>
     <span style={{...style.status,...(colors[item.state]||colors.missing)}}>
      {labels[item.state]||"Ukjent"}
     </span>
     <p style={style.muted}>{item.detail}</p>
    </div>
    <div>
     <strong style={{fontSize:13}}>Siste registrerte kjøring</strong>
     <p style={style.muted}>{displayTime(item.lastStartedAt)}</p>
    </div>
    <div>
     <strong style={{fontSize:13}}>Siste vellykkede kjøring</strong>
     <p style={style.muted}>{displayTime(item.lastSuccessAt)}</p>
    </div>
   </div>)}
   <p style={{...style.muted,marginTop:14}}>
    «OK» betyr at jobbens egen respons ikke rapporterte kjente feil. Det garanterer ikke levering hos Resend, bankavstemming eller fullført fakturabokføring. En pågående jobb kan fremstå uavklart ved time-out.
   </p>
  </div>
  <div style={style.surface}>
   <h2 style={{fontSize:20,margin:"0 0 8px"}}>Varsler om driftsavvik</h2>
   <p style={style.muted}>Etter første hele driftsdag kontrollerer en egen Vercel-jobb Service-jobbene kl. 14:30 UTC og forsøker å sende én samlet feilrapport til bedriftens eieradresse. En uklar sending prøves ikke automatisk på nytt.</p>
   {!error&&(alerts.length?alerts.map(item=><p key={item.alert_day} style={{padding:"10px 0",borderBottom:"1px solid #eee8de",fontSize:14}}>
    <strong>{item.alert_day}</strong> · {item.issue_count} avvik · {item.state==="sent"?"Varsel sendt":item.state==="uncertain"?"Sendestatus ukjent – kontroller Resend":"Varsel forsøkt – kontroller Resend"}
    {item.sent_at?" · "+displayTime(item.sent_at):""}
   </p>):<p style={style.muted}>Ingen varsler registrert. Dette beviser ikke at overvåkingen har kjørt tidligere.</p>)}
   <p style={{...style.muted,marginTop:14}}>
    Overvåkingen kan ikke varsle om sitt eget bortfall når Vercel, databasen eller e-postleverandøren samtidig er nede. Ekstern oppetidskontroll og eierens kontroll av faktiske e-poster er fortsatt nødvendig.
   </p>
  </div>
  <ServiceReminderReviewClient/>
  <p style={{marginTop:22,fontSize:14}}>
   <Link href="/admin">Tilbake til administrasjon</Link>
  </p>
  <p style={style.muted}>Utleiejobbene og den delte kvitteringsjobben for Service/utleie er ikke inkludert her. Ingen utleiedata endres.</p>
 </main>;
}
