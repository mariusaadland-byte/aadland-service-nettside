import { createClient } from "@supabase/supabase-js";
export function db() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key) return null;
  return createClient(url,key,{auth:{persistSession:false}});
}
export function fromDbProduct(p){
  return {id:p.id,slug:p.slug,name:p.name,category:p.category,eyebrow:p.eyebrow,description:p.description,basePriceOre:p.base_price_ore,options:p.options||[],imageUrl:p.image_url,icon:p.icon,accent:p.accent,featured:p.featured,active:p.active};
}
