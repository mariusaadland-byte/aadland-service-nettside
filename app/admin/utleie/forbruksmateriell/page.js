import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import ConsumableAdmin from "./ConsumableAdmin";
export const dynamic="force-dynamic";
export const metadata={title:"Forbruksmateriell – Aadland Utleie",robots:{index:false,follow:false}};
export default async function Page(){
 const user=await getAdminUser();if(!user)redirect("/admin/login");if(user.role!=="owner")redirect("/admin");
 const enabled=process.env.VERCEL_ENV==="production"&&process.env.RENTAL_CONSUMABLE_ADMIN_ENABLED==="true";
 let products=[],items=[],movements=[],error="";
 if(enabled){const s=db();if(!s)error="Database utilgjengelig.";else{
 const [a,b,c]=await Promise.all([s.from("rental_consumables").select("id,name,sku,rental_item_id,price_ore,cost_ore,stock_quantity,low_stock_threshold,active,revision",{count:"exact"}).order("name").limit(500),s.from("rental_items").select("id,name",{count:"exact"}).order("name").limit(500),s.from("rental_consumable_movements").select("request_id,consumable_id,delta,reason,note,before_quantity,after_quantity,created_at").order("created_at",{ascending:false}).limit(100)]);
 if(a.error||b.error||c.error||a.count!==a.data?.length||b.count!==b.data?.length)error="Registeret kunne ikke hentes fullstendig.";else{products=a.data;items=b.data;movements=c.data;}
 }}
 return <main style={{maxWidth:1000,margin:"auto",padding:20}}><Link href="/admin/utleie/oversikt">← Utleieoversikt</Link><h1>Forbruksmateriell</h1><p>Separat lager for salgsvarer. Ingen automatisk bestilling eller betaling.</p>{!enabled?<p>Administrasjon er klargjort, men avventer databaseoppsett og test.</p>:error?<p role="alert">{error}</p>:<ConsumableAdmin key={JSON.stringify(products)} products={products} items={items} movements={movements}/>}</main>;
}
