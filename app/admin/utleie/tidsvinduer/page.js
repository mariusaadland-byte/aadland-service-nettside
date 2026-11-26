import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {osloDateKey} from "../../../../lib/osloTime";
import AppointmentClient from "./AppointmentClient";
import styles from "../oversikt/dashboard.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Henting og retur – Aadland Utleie",robots:{index:false,follow:false}};
export default async function Appointments(){
 const u=await getAdminUser();if(!u)redirect("/admin/login");if(u.role!=="owner")redirect("/admin");
 const today=osloDateKey(new Date()),enabled=process.env.VERCEL_ENV==="production"&&process.env.RENTAL_APPOINTMENTS_ENABLED==="true"&&process.env.RENTAL_PUBLIC_BOOKING_ENABLED!=="true";
 let slots=[],bookings=[],error="",limited=false;
 if(enabled){
  const s=db();if(!s)error="Database utilgjengelig.";else{
   const [a,b]=await Promise.all([s.from("rental_appointment_slots").select("id,slot_date,slot_time,kind,booking_id,assigned_kind",{count:"exact"}).gte("slot_date",today).order("slot_date").order("slot_time").limit(500),s.from("rental_bookings").select("id,booking_number,start_date,end_date,status,customer",{count:"exact"}).is("archived_at",null).in("status",["new","confirmed","active"]).gte("end_date",today).order("start_date").limit(500)]);
   if(a.error||b.error)error="Tidsvinduer eller bookinger kunne ikke hentes. Kontroller databaseoppsettet.";else{slots=a.data||[];bookings=(b.data||[]).filter(x=>x.customer?.fulfillment==="pickup").map(({id,booking_number,start_date,end_date,status})=>({id,booking_number,start_date,end_date,status}));limited=a.count>slots.length||b.count>(b.data||[]).length;}
  }
 }
 return <main className={styles.root}><header><Link href="/admin/utleie/oversikt">← Utleieoversikt</Link><p className={styles.kicker}>AADLAND UTLEIE</p><h1>Henting og retur – tidsvinduer</h1><p>Åpne de halvtimene du faktisk er tilgjengelig. Alle tider er norsk lokal tid.</p></header><p className={styles.warning}>Ingen faste åpningstider er lagt inn. Tidsvinduet er en separat avtale, ikke en endring i leieperiode eller pris. Kunden får ikke automatisk melding. Offentlig selvbetjening er ikke aktivert.</p>{!enabled?<p>Funksjonen er klargjort, men lagring er deaktivert før databaseoppsett og test.</p>:error?<p role="alert">{error}</p>:<AppointmentClient slots={slots} bookings={bookings} today={today} limited={limited}/>}<nav className={styles.links}><Link href="/admin?vis=rentalBookings">Bookinger</Link><Link href="/admin?vis=rentalCalendar">Kalender</Link></nav></main>;
}
