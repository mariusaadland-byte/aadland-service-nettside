import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import {db,fromDbRentalItem} from "../../../../lib/supabase";
import {osloDateKey} from "../../../../lib/osloTime";
import {rentalWindowConfig} from "../../../../lib/rentalPickupWindows.mjs";
import ManualBookingClient from "./ManualBookingClient";
import styles from "../oversikt/dashboard.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Manuell booking – Aadland Utleie",robots:{index:false,follow:false}};
export default async function ManualBookingPage(){
 const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");
 const enabled=process.env.VERCEL_ENV==="production"&&process.env.RENTAL_MANUAL_BOOKING_ENABLED==="true"&&process.env.RENTAL_PUBLIC_BOOKING_ENABLED!=="true";
 const s=db();let items=[],error="";
 if(s){const r=await s.from("rental_items").select("*").eq("active",true).eq("status","available").order("name").limit(500);if(r.error)error="Utstyr kunne ikke hentes.";else items=(r.data||[]).map(fromDbRentalItem).filter(i=>i.pickupAvailable).map(i=>({id:i.id,name:i.name,quantity:i.quantity,dailyPriceOre:i.dailyPriceOre,weeklyPriceOre:i.weeklyPriceOre,weekendPriceOre:i.weekendPriceOre,depositOre:i.depositOre,longTermDays:i.longTermDays,longTermDiscountPercent:i.longTermDiscountPercent}));}else error="Databasen er ikke tilgjengelig.";
 return <main className={styles.root}><header><Link href="/admin/utleie/oversikt">← Utleieoversikt</Link><p className={styles.kicker}>AADLAND UTLEIE</p><h1>Ny manuell booking</h1><p>Registrer telefonbestilling eller personlig oppmøte for privatkunde med henting. Pris beregnes fra produktets registrerte priser.</p></header><p className={styles.warning}>{enabled?"Registrering reserverer utstyret og oppretter en ubetalt, bekreftet booking. Ingen e-post, betaling eller faktura sendes automatisk.":"Klargjort, men lagring er deaktivert inntil kontrollert test og godkjenning. Du kan se skjemaet uten å opprette en bestilling."}</p>{error?<p role="alert">{error}</p>:<ManualBookingClient windowConfig={rentalWindowConfig(process.env)} items={items} today={osloDateKey(new Date())} enabled={enabled}/>}<nav className={styles.links}><Link href="/admin?vis=rentalBookings">Bookinger</Link><Link href="/admin?vis=rentalCalendar">Kalender</Link></nav></main>;
}
