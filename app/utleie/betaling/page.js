import Link from "next/link";
import {getCustomerUserId} from "../../../lib/customer-auth";
import {groupVippsCheckoutEnabled} from "../../../lib/groupVippsCheckout";
import {rentalUnitId} from "../../../lib/rentalUnitQr.mjs";
import GroupPaymentPanel from "../handlekurv/GroupPaymentPanel";
import styles from "../handlekurv/cart.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Betalingsstatus – Aadland Utleie",robots:{index:false,follow:false}};
export default async function Page({searchParams}){
 const p=await searchParams,groupId=p?.gruppe;
 const enabled=groupVippsCheckoutEnabled(),customerId=enabled?await getCustomerUserId():null;
 return <main className={styles.root+" "+styles.line+" "+styles.checkout}><h1>Betalingsstatus</h1>{!enabled?<p>Betaling er ikke åpnet.</p>:!customerId?<p><Link href="/min-side">Logg inn</Link> og åpne denne siden igjen.</p>:!rentalUnitId(groupId)?<p>Ugyldig bestillingsreferanse.</p>:<GroupPaymentPanel groupId={groupId}/>}<p><Link href="/utleie/handlekurv">Tilbake til handlekurv</Link></p></main>;
}
