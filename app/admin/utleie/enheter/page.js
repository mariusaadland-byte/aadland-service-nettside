import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {rentalUnitLabel} from "../../../../lib/rentalUnitQr.mjs";
import RegisterUnit from "./RegisterUnit";
import styles from "./units.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Individregister – Aadland Utleie",robots:{index:false,follow:false}};
export default async function Units(){
 const u=await getAdminUser();if(!u)redirect("/admin/login");
 const manage=u.role==="owner"||u.canManageProducts;if(!manage&&!u.canViewOrders)redirect("/admin");
 const enabled=process.env.VERCEL_ENV==="production"&&process.env.RENTAL_UNIT_REGISTER_ENABLED==="true";
 const s=db();let units=[],items=[],error="",limited=false;
 if(s&&enabled){
  const [a,b]=await Promise.all([s.from("rental_equipment_units").select("id,serial_number,rental_items(name)",{count:"exact"}).order("created_at",{ascending:false}).limit(500),manage?s.from("rental_items").select("id,name").order("name").limit(500):Promise.resolve({data:[]})]);
  if(a.error||b.error)error="Registeret kunne ikke hentes. Kontroller databaseoppsettet.";else{units=a.data||[];items=b.data||[];limited=a.count>units.length;}
 }else if(enabled)error="Database utilgjengelig.";
 return <main className={styles.root}><Link href="/admin/utleie/oversikt">← Utleieoversikt</Link><h1>Individregister og QR-koder</h1><p>Én varig identitet per fysisk maskin. Registrering endrer ikke bookbar kapasitet.</p>{!enabled&&<p role="status">Individregisteret er klargjort, men ikke aktivert. Databaseoppsett og test gjenstår.</p>}{error&&<p role="alert">{error}</p>}{enabled&&!error&&<>{manage&&<RegisterUnit items={items}/>}<h2>Registrert utstyr</h2>{limited&&<p>Viser de 500 nyeste enhetene.</p>}{units.length===0?<p>Ingen enheter registrert.</p>:<div className={styles.grid}>{units.map(i=><Link key={i.id} className={styles.unit} href={"/admin/utleie/enheter/"+i.id}><b>{i.rental_items?.name||"Utstyr"}</b><span>{i.serial_number||"Uten serienummer"}</span><small>{rentalUnitLabel(i.id)}</small>Åpne QR-etikett →</Link>)}</div>}</>}</main>;
}
