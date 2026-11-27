import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser,hasPermission} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {rentalUnitId} from "../../../../../lib/rentalUnitQr.mjs";
import {rentalManualPageUrl} from "../../../../../lib/rentalManuals.mjs";
import ManualEditor from "./ManualEditor";
import UnitLabel from "../../enheter/UnitLabel";
import styles from "../../oversikt/dashboard.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Bruksanvisning – Aadland Utleie",robots:{index:false,follow:false}};
export default async function ManualAdmin({params}){
 const u=await getAdminUser();if(!u)redirect("/admin/login");if(!(u.role==="owner"||await hasPermission("canManageProducts")))redirect("/admin");
 const {id}=await params;if(!rentalUnitId(id))redirect("/admin/utleie");
 const enabled=process.env.VERCEL_ENV==="production"&&process.env.RENTAL_MANUALS_ENABLED==="true";
 const publicEnabled=process.env.RENTAL_MANUALS_PUBLIC_ENABLED==="true";
 const s=db();let item=null,version=null,error="";
 if(s){const a=await s.from("rental_items").select("id,name,active,status").eq("id",id).maybeSingle();if(a.error||!a.data)error="Utstyret kunne ikke hentes.";else{item=a.data;if(enabled){const b=await s.from("rental_manual_versions").select("*").eq("rental_item_id",id).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(1).maybeSingle();if(b.error)error="Bruksanvisningsregisteret kunne ikke hentes. Kontroller databaseoppsettet.";else version=b.data;}}}else error="Databasen er utilgjengelig.";
 return <main className={styles.root}><header><Link href="/admin/utleie">← Utleieutstyr</Link><p className={styles.kicker}>AADLAND UTLEIE</p><h1>Bruksanvisning og sikkerhet</h1><p>{item?.name}</p></header>{error?<p role="alert">{error}</p>:<><p className={styles.warning}>{enabled?"Kontroller at dokumentet gjelder nøyaktig modell og variant.":"Registeret er klargjort, men database og lagring er ikke aktivert."} Ikke erstatt produsentens bruksanvisning med egen tekst.</p><ManualEditor key={version?.id||"new"} id={id} version={version} enabled={enabled} publicEnabled={publicEnabled}/>{enabled&&publicEnabled&&version?.published&&item?.active&&item.status!=="hidden"&&<section><h2>Kundens QR-etikett</h2><p>Åpner bruksanvisningen, ikke administrasjonen. Kontroller lenken før etiketten tas i bruk.</p><Link href={"/utleie/bruksanvisning/"+id} target="_blank">Åpne kundesiden</Link><UnitLabel url={rentalManualPageUrl(id)} label="BRUKSANVISNING" name={item.name}/></section>}</>}</main>;
}
