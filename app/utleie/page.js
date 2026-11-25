import {db,fromDbRentalItem} from "../../lib/supabase";
import {rentalStructuredData} from "../../lib/rentalSeo.mjs";
import RentalCatalogClient from "./RentalCatalogClient";
export const dynamic="force-dynamic";
export default async function RentalPage(){
 let initialItems=[],initialCategories=[],initialReady=false;
 try{
  const s=db();
  if(s){
   const [items,categories]=await Promise.all([
    s.from("rental_items").select("*").eq("active",true).neq("status","hidden").order("sort_order"),
    s.from("rental_categories").select("id,name,slug,description,sort_order,active").eq("active",true).order("sort_order")
   ]);
   if(!items.error&&!categories.error){
    initialCategories=(categories.data||[]).map(c=>({id:c.id,name:c.name,slug:c.slug,description:c.description||"",sortOrder:Number(c.sort_order)||0,active:c.active!==false}));
    const byId=new Map(initialCategories.map(c=>[c.id,c]));
    initialItems=(items.data||[]).map(i=>fromDbRentalItem({...i,category_name:byId.get(i.category_id)?.name||"",category_slug:byId.get(i.category_id)?.slug||""}));
    initialReady=true;
   }
  }
 }catch{}
 return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(rentalStructuredData)}}/><RentalCatalogClient initialItems={initialItems} initialCategories={initialCategories} initialReady={initialReady} initialBookingOpen={process.env.VERCEL_ENV==="production"&&process.env.RENTAL_PUBLIC_BOOKING_ENABLED==="true"}/></>;
}
