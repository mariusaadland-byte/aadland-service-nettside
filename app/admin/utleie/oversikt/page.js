import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {osloDateKey} from "../../../../lib/osloTime";
import {rentalDashboardMoney} from "../../../../lib/rentalDashboard.mjs";
import styles from "./dashboard.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Utleieoversikt – Aadland Utleie",robots:{index:false,follow:false}};
const countValue=r=>!r||r.error||!Number.isInteger(r.count)?null:r.count;
const money=v=>v===null?"—":new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(v/100);
function Stat({label,value,href,description}){
 return <Link className={styles.stat} href={href}><span>{label}</span><strong>{value??"—"}</strong><small>{description}</small></Link>;
}
export default async function RentalDashboard(){
 const user=await getAdminUser();if(!user)redirect("/admin/login");
 const orders=user.role==="owner"||user.canViewOrders;
 const products=user.role==="owner"||user.canManageProducts;
 if(!orders&&!products)redirect("/admin");
 const s=db(),today=osloDateKey(new Date());
 let stats={},amounts=null,failed=false;
 if(s){
  const tasks=[];
  if(orders){
   const q=()=>s.from("rental_bookings").select("id",{count:"exact",head:true}).is("archived_at",null);
   tasks.push(["new",q().eq("status","new")],["confirmed",q().eq("status","confirmed")],["active",q().eq("status","active")],["late",q().eq("status","active").lt("end_date",today)],["due",q().eq("status","active").eq("end_date",today)],["pickup",q().eq("status","confirmed").eq("start_date",today)],["returned",q().eq("status","returned")]);
   if(user.role==="owner")tasks.push(["money",s.from("rental_bookings").select("payment_captured_ore,payment_refunded_ore,deposit_held_ore,deposit_charged_ore",{count:"exact"}).order("id").limit(1000)]);
  }
  if(products){
   const q=()=>s.from("rental_items").select("id",{count:"exact",head:true});
   tasks.push(["products",q()],["published",q().eq("active",true).eq("status","available")],["maintenance",q().eq("status","maintenance")]);
  }
  const results=await Promise.allSettled(tasks.map(async([key,query])=>[key,await query]));
  for(const result of results){
   if(result.status!=="fulfilled"){failed=true;continue;}
   const [key,value]=result.value;if(value.error)failed=true;
   if(key==="money")amounts=value.error?null:rentalDashboardMoney(value.data,value.count);
   else stats[key]=countValue(value);
  }
 }else failed=true;
 return <main className={styles.root}>
  <header><Link href="/admin">← Administrasjon</Link><p className={styles.kicker}>AADLAND UTLEIE</p><h1>Utleieoversikt</h1><p>Arbeidsliste og registrerte nøkkeltall · {today}</p><Link href="/admin/utleie/oversikt" className={styles.action}>Oppdater oversikten</Link></header>
  {user.role==="owner"&&<section><h2>Lanseringsstatus</h2><p className={styles.warning}>{process.env.VERCEL_ENV==="production"&&process.env.RENTAL_PUBLIC_BOOKING_ENABLED==="true"?"Bookingbryter er på. Dette er ikke en attest på gjennomført sluttkontroll.":"Klargjøring – offentlig booking er stengt. Du kan fortsatt registrere utstyr og administrere tidligere bookinger."}</p><nav className={styles.links}><Link href="/admin/utleie">Registrer utstyr</Link><Link href="/admin/utleie/vipps-oppsett">Vipps-oppsett</Link><Link href="/admin/utviklingsplan?vis=utleie">Test og godkjenn</Link></nav></section>}
  {failed&&<p role="alert" className={styles.warning}>Noen tall kunne ikke hentes. En strek betyr ukjent, ikke null.</p>}
  {orders&&<section><h2>Bookinger og oppfølging</h2><div className={styles.grid}>
   <Stat label="Nye bookinger" value={stats.new} href="/admin?vis=rentalBookings" description="Åpne arbeidslisten"/>
   <Stat label="Bekreftede" value={stats.confirmed} href="/admin?vis=rentalBookings" description="Venter utlevering"/>
   <Stat label="Utlevert" value={stats.active} href="/admin?vis=rentalBookings" description="Aktive leieforhold"/>
   <Stat label="Utlevering i dag" value={stats.pickup} href="/admin?vis=rentalCalendar" description="Bekreftede bookinger"/>
   <Stat label="Retur i dag" value={stats.due} href="/admin?vis=rentalCalendar" description="Utlevert utstyr"/>
   <Stat label="Forsinket retur" value={stats.late} href="/admin?vis=rentalBookings" description="Bruk filter for forsinkede returer"/>
   <Stat label="Returnert, ikke fullført" value={stats.returned} href="/admin?vis=rentalBookings" description="Kontroller oppgjør"/>
  </div><nav className={styles.links}><Link href="/admin?vis=rentalBookings">Bookinger</Link><Link href="/admin?vis=rentalCalendar">Kalender</Link><Link href="/admin/utleie/depositum">Depositum og returkontroll</Link></nav></section>}
  {products&&<section><h2>Utstyrspark</h2><div className={styles.grid}>
   <Stat label="Produkter" value={stats.products} href="/admin/utleie" description="Alle registrerte produkttyper"/>
   <Stat label="Publisert og bookbart" value={stats.published} href="/admin/utleie" description="Ikke sanntids lagerkapasitet"/>
   <Stat label="Vedlikehold" value={stats.maintenance} href="/admin/utleie" description="Produktstatus vedlikehold"/>
  </div><nav className={styles.links}><Link href="/admin/utleie">Utstyr</Link><Link href="/admin/utleie/ny">Legg til utstyr</Link><Link href="/admin/utleie/enheter">Individregister og QR-koder</Link></nav></section>}
  {user.role==="owner"&&<section><h2>Registrerte betalinger – hele historikken</h2>{!amounts&&<p className={styles.warning}>Beløp ikke vist: grunnlaget er ufullstendig, over 1 000 bookinger eller må avstemmes.</p>}<div className={styles.grid}>
   <Stat label="Registrert leiebetaling" value={money(amounts?.captured??null)} href="/admin?vis=rentalBookings" description="Inkl. mva."/>
   <Stat label="Registrert refundert" value={money(amounts?.refunded??null)} href="/admin?vis=rentalBookings" description="Leie, ikke depositum"/>
   <Stat label="Netto registrert leie" value={money(amounts?.net??null)} href="/admin?vis=rentalBookings" description="Ikke bankavstemt resultat"/>
   <Stat label="Registrert depositum mottatt" value={money(amounts?.held??null)} href="/admin/utleie/depositum" description="Historisk, ikke nåværende saldo"/>
   <Stat label="Registrert depositum brukt" value={money(amounts?.charged??null)} href="/admin/utleie/depositum" description="Separat fra leie"/>
  </div><p>Inkluderer arkiverte bookinger. Ikke regnskap, fortjeneste eller bekreftet bankoppgjør.</p><nav className={styles.links}><Link href="/admin/utleie/vipps-oppsett">Vipps-oppsett</Link><Link href="/admin/utleie/lonnsomhet">Lønnsomhetskalkulator</Link><Link href="/admin/utviklingsplan?vis=utleie">Test og godkjenn utleie</Link></nav></section>}
 </main>;
}
