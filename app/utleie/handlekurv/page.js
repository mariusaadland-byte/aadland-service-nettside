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
 let items=[],consumables=[],error="";
 if(enabled){const s=db();if(!s)error="Databasen er utilgjengelig.";else{const r=await s.from("rental_items").select("*").eq("active",true).eq("status","available").order("name").limit(500);if(r.error)error="Utstyret kunne ikke hentes.";else items=(r.data||[]).map(fromDbRentalItem).filter(i=>i.pickupAvailable).map(i=>({id:i.id,name:i.name,quantity:i.quantity}));}}
 if(enabled&&!error&&process.env.RENTAL_CONSUMABLES_ENABLED==="true"){const s=db();const r=await s.from("rental_consumables").select("id,name,rental_item_id,price_ore,stock_quantity").eq("active",true).gt("stock_quantity",0).order("name").limit(500);if(r.error)error="Forbruksmateriell kunne ikke hentes.";else consumables=(r.data||[]).filter(p=>items.some(i=>i.id===p.rental_item_id)).map(({id,name,rental_item_id,price_ore})=>({id,name,rental_item_id,price_ore}));}
 return <main className="catalogPage rentalPage"><CatalogHeader rental/><section className="catalogWrap" style={{padding:"30px 16px 50px"}}><Link href="/utleie">← Tilbake til utstyr</Link><h1>Leiehandlekurv</h1>{!enabled?<p>Under klargjøring. Bestilling av flere maskiner er ikke åpnet ennå.</p>:error?<p role="alert">{error}</p>:<RentalCartClient consumables={consumables} items={items} today={osloDateKey(new Date())} initialItemId={typeof params?.itemId==="string"?params.itemId:""}/>}</section><CatalogFooter rental/></main>;
}
