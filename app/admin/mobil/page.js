import {redirect} from "next/navigation";
import Link from "next/link";
import {getAdminUser} from "../../../lib/auth";
import styles from "./mobileAdmin.module.css";
export const metadata={
 title:"Admin-app",
 description:"Aadland Service mobiladmin for innloggede medarbeidere",
 robots:{index:false,follow:false},
};
const links=[
 {name:"Tilbud",subtitle:"Opprett og følg opp tilbud",href:"/admin/tilbud",emoji:"📝",access:"sales"},
 {name:"Faktura",subtitle:"Lag og send fakturaer",href:"/admin/faktura",emoji:"🧾",access:"sales"},
 {name:"Fakturaarkiv",subtitle:"Betalinger, kreditnota og purring",href:"/admin/faktura/arkiv",emoji:"📂",access:"sales"},
 {name:"Kunder og bestillinger",subtitle:"Åpne admin for kunder og oppdrag",href:"/admin",emoji:"👥",access:"orders"},
 {name:"Oppdragsklokke",subtitle:"Registrer tid underveis",href:"/admin/arbeidsklokke",emoji:"⏱️",access:"orders"},
 {name:"Tegneprogram",subtitle:"Prosjekter og tegninger",href:"/admin/tegning",emoji:"📐",access:"products"},
 {name:"Utleie",subtitle:"Bestillinger og tilgjengelighet",href:"/admin",emoji:"📅",access:"orders"},
 {name:"Vipps",subtitle:"Betaling og oppgjør",href:"/admin/vipps",emoji:"💳",access:"owner"},
 {name:"MVA og bilag",subtitle:"Leverandørbilag og MVA-oversikt",href:"/admin/faktura/mva",emoji:"📸",access:"owner"},
];
export default async function MobileAdmin(){
 const user=await getAdminUser();
 if(!user)redirect("/admin/login");
 const owner=user.role==="owner";
 const canSales=owner||user.canUpdateOrders||user.canManageProducts;
 const canOrders=owner||user.canViewOrders;
 const canProducts=owner||user.canManageProducts;
 const items=links.filter(item=>
  item.access==="owner"?owner:
  item.access==="sales"?canSales:
  item.access==="orders"?canOrders:canProducts
 );
 return <main className={styles.shell}>
  <header className={styles.header}>
   <div className={styles.brand}>AS</div>
   <div><p className={styles.eyebrow}>AADLAND SERVICE</p><h1>Admin-appen</h1></div>
  </header>
  <p className={styles.lead}>Snarveier til arbeidet ditt, samlet på mobil. Du bruker samme sikre innlogging som i administrasjonen.</p>
  <div className={styles.grid}>{items.map(item=>
   <Link href={item.href} key={item.name} className={styles.tile}>
    <span className={styles.emoji} aria-hidden>{item.emoji}</span>
    <strong>{item.name}</strong><span>{item.subtitle}</span>
   </Link>
  )}</div>
  <footer className={styles.footer}>
   <Link href="/admin">Åpne full administrasjon</Link>
   <p>Legg denne siden på Hjem-skjermen fra Safari for å åpne admin som en egen app.</p>
  </footer>
 </main>;
}
