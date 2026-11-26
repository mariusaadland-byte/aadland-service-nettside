import Link from "next/link";
import {CatalogHeader,CatalogFooter} from "../../produkter/ProductChrome";
import {db,fromDbRentalItem} from "../../../lib/supabase";
import {osloDateKey} from "../../../lib/osloTime";
import RentalCartClient from "./RentalCartClient";
export const dynamic="force-dynamic";
export const metadata={title:"Leiehandlekurv",robots:{index:false,follow:false}};
export default async function RentalCartPage({searchParams}){
 const enabled=process.env.VERCEL_ENV==="production"&&process.env.RENTAL_PUBLIC_BOOKING_ENABLED==="true"&&process.env.RENTAL_CART_ENABLED==="true";
 const params=await searchParams;
 let items=[],error="";
 if(enabled){const s=db();if(!s)error="Databasen er utilgjengelig.";else{const r=await s.from("rental_items").select("*").eq("active",true).eq("status","available").order("name").limit(500);if(r.error)error="Utstyret kunne ikke hentes.";else items=(r.data||[]).map(fromDbRentalItem).filter(i=>i.pickupAvailable).map(i=>({id:i.id,name:i.name,quantity:i.quantity}));}}
 return <main className="catalogPage rentalPage"><CatalogHeader rental/><section className="catalogWrap" style={{padding:"30px 16px 50px"}}><Link href="/utleie">← Tilbake til utstyr</Link><h1>Leiehandlekurv</h1>{!enabled?<p>Under klargjøring. Bestilling av flere maskiner er ikke åpnet ennå.</p>:error?<p role="alert">{error}</p>:<RentalCartClient items={items} today={osloDateKey(new Date())} initialItemId={typeof params?.itemId==="string"?params.itemId:""}/>}</section><CatalogFooter rental/></main>;
}
