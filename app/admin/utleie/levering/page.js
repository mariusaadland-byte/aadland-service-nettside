import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import styles from "../oversikt/dashboard.module.css";
import DeliveryClient from "./DeliveryClient";
export const dynamic="force-dynamic";
export const metadata={title:"Leveringskalkulator – Aadland Utleie",robots:{index:false,follow:false}};
export default async function DeliveryPage(){
 const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");
 return <main className={styles.root}><header><Link href="/admin/utleie/oversikt">← Utleieoversikt</Link><p className={styles.kicker}>AADLAND UTLEIE</p><h1>Levering og innhenting</h1><p>Beregn transportprisen før du avtaler leie med kunden.</p></header><p className={styles.warning}>Dette er en intern kalkulator. Ingen automatisk ruteoppslag, bestilling, prislagring eller betalingskrav. Avstand og postnummer må kontrolleres manuelt.</p><DeliveryClient/></main>;
}
