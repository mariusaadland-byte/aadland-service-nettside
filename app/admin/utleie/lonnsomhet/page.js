import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {rentalUnitId} from "../../../../lib/rentalUnitQr.mjs";
import {rentalProductReceipts} from "../../../../lib/rentalProfitability.mjs";
import ProfitabilityClient from "./ProfitabilityClient";
import styles from "./profitability.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"Lønnsomhetskalkulator – Aadland Utleie",robots:{index:false,follow:false}};
const money=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
export default async function Profitability({searchParams}){
 const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");
 const params=await searchParams;
 const s=db();let items=[],itemId=rentalUnitId(params?.itemId)?params.itemId:"",unit=null,error="",net=null,count=null;
 try{
  if(!s)throw Error("Database utilgjengelig");
  if(rentalUnitId(params?.unitId)&&process.env.VERCEL_ENV==="production"&&process.env.RENTAL_UNIT_REGISTER_ENABLED==="true"){
   const {data,error:e}=await s.from("rental_equipment_units").select("id,rental_item_id,serial_number,rental_items(name)").eq("id",params.unitId).maybeSingle();
   if(e||!data)throw Error("Maskinen kunne ikke hentes.");unit=data;itemId=data.rental_item_id;
  }
  const {data,error:e}=await s.from("rental_items").select("id,name,quantity,daily_price_ore").order("name").limit(500);
  if(e)throw Error("Produktlisten kunne ikke hentes.");items=data||[];
  if(itemId){
   const q=await s.from("rental_bookings").select("payment_captured_ore,payment_refunded_ore",{count:"exact"}).eq("rental_item_id",itemId).order("id").limit(1000);
   if(!q.error){net=rentalProductReceipts(q.data,q.count);count=q.count;}
  }
 }catch(e){error=e.message;}
 const selected=items.find(i=>i.id===itemId);
 return <main className={styles.root}><Link href="/admin/utleie/oversikt">← Utleieoversikt</Link><h1>Lønnsomhet per maskin</h1><p>Beregn forventet tilbakebetaling og registrert dekning med egne tall. Kalkulatoren lagrer ikke data eller endrer regnskapet.</p>{error&&<p role="alert">{error}</p>}
 <section className={styles.panel}><h2>Produktgrunnlag</h2>{unit&&<p><b>{unit.rental_items?.name||"Maskin"}</b> · Serienummer: {unit.serial_number||"Ikke oppgitt"}</p>}
 <form method="get"><label>Produkttype<select name="itemId" defaultValue={itemId}><option value="">Velg produkt (valgfritt)</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label><button className="btn alt" type="submit">Vis registrert produktgrunnlag</button></form>
 {selected&&<div><p>Listepris per døgn inkl. mva.: <b>{money(selected.daily_price_ore)}</b> · Registrert antall: {selected.quantity}</p><p>Registrerte leiebetalinger minus refusjoner for hele produkttypen, inkl. mva. og arkiverte bookinger: <b>{net===null?"Ukjent":money(net)}</b></p><p>{count===null?"Betalingsgrunnlag kunne ikke kontrolleres.":count+" bookinger i grunnlaget."} Ikke bankavstemt, ikke inntekt per fysisk maskin. Depositum er ikke med.</p></div>}
 </section><ProfitabilityClient key={unit?.id||itemId||"manual"}/></main>;
}
