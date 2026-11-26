import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {osloDateKey} from "../../../../lib/osloTime";
import {ownUseReason} from "../../../../lib/rentalOwnUse.mjs";
import OwnUseClient from "./OwnUseClient";
import styles from "../oversikt/dashboard.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Eget bruk – Aadland Utleie",robots:{index:false,follow:false}};
export default async function OwnUsePage(){
 const user=await getAdminUser();if(!user)redirect("/admin/login");
 if(!(user.role==="owner"||await hasPermission("canManageProducts")))redirect("/admin");
 const today=osloDateKey(new Date()),s=db();
 const enabled=process.env.VERCEL_ENV==="production"&&process.env.RENTAL_PUBLIC_BOOKING_ENABLED!=="true";
 let items=[],reservations=[],error="",limited=false;
 if(s){
 const [a,b]=await Promise.all([s.from("rental_items").select("id,name,quantity").order("name").limit(500),s.from("rental_blocks").select("id,rental_item_id,start_date,end_date,reason",{count:"exact"}).like("reason","EGET OPPDRAG | %").order("start_date",{ascending:false}).limit(500)]);
 if(a.error||b.error)error="Utstyr eller reservasjoner kunne ikke hentes.";else{items=a.data||[];reservations=(b.data||[]).map(x=>({...x,reference:ownUseReason(x.reason)}));limited=b.count>reservations.length;}
 }else error="Databasen er ikke tilgjengelig.";
 return <main className={styles.root}><header><Link href="/admin/utleie/oversikt">← Utleieoversikt</Link><p className={styles.kicker}>AADLAND UTLEIE / INTERN RESERVASJON</p><h1>Reserver utstyr til eget oppdrag</h1><p>Hold utstyr av til Aadland Service uten kundeordre, faktura eller betaling.</p></header>
 <p className={styles.warning}>En reservasjon sperrer hele produkttypen, også når det finnes flere like maskiner. Individuell kapasitet og automatisk kobling til oppdrag gjenstår. Offentlig booking må være stengt for å registrere nye interne reservasjoner.</p>
 {error?<p role="alert">{error}</p>:<OwnUseClient items={items} reservations={reservations} today={today} enabled={enabled} limited={limited}/>}
 <nav className={styles.links}><Link href="/admin?vis=rentalCalendar">Utleiekalender</Link><Link href="/admin/utleie">Utstyr</Link></nav></main>;
}
