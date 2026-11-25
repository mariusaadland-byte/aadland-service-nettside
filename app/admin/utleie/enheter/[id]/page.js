import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {rentalUnitId,rentalUnitLabel,rentalUnitUrl} from "../../../../../lib/rentalUnitQr.mjs";
import UnitLabel from "../UnitLabel";
import styles from "../units.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Utstyrsetikett – Aadland Utleie",robots:{index:false,follow:false}};
export default async function Unit({params}){
 const u=await getAdminUser();if(!u)redirect("/admin/login");
 if(!(u.role==="owner"||u.canManageProducts||u.canViewOrders))redirect("/admin");
 const {id}=await params;if(!rentalUnitId(id))redirect("/admin/utleie/enheter");
 const s=db();const enabled=process.env.VERCEL_ENV==="production"&&process.env.RENTAL_UNIT_REGISTER_ENABLED==="true";
 if(!s||!enabled)return <main className={styles.root}><Link href="/admin/utleie/enheter">← Register</Link><p>Individregisteret er ikke aktivert.</p></main>;
 const {data,error}=await s.from("rental_equipment_units").select("id,serial_number,rental_items(name)").eq("id",id).maybeSingle();
 if(error||!data)return <main className={styles.root}><Link href="/admin/utleie/enheter">← Register</Link><p>Enheten kunne ikke hentes.</p></main>;
 return <main className={styles.root}><div className={styles.noPrint}><Link href="/admin/utleie/enheter">← Individregister</Link><h1>{data.rental_items?.name||"Utstyr"}</h1><p>Serienummer: {data.serial_number||"Ikke registrert"}</p><p>Skann etiketten med mobilkameraet når du er logget inn på utleiedomenet. Dette identifiserer enheten, men registrerer ikke automatisk utlevering eller retur.</p></div><UnitLabel url={rentalUnitUrl(data.id)} label={rentalUnitLabel(data.id)} name={data.rental_items?.name||"Utstyr"}/></main>;
}
