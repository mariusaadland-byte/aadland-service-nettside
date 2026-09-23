import {db} from "../lib/supabase";

const base="https://www.aadland-service.no";

function entry(path,changeFrequency="monthly",priority=.6,lastModified){
 return {
  url:base+path,
  changeFrequency,
  priority,
  ...(lastModified?{lastModified:new Date(lastModified)}:{})
 };
}

export default async function sitemap(){
 const staticEntries=[
  entry("/","weekly",1),
  entry("/produkter","weekly",.85),
  entry("/utleie","weekly",.8),
  entry("/prosjekter","weekly",.8),
  entry("/personvern","yearly",.2),
  entry("/vilkar/salg","yearly",.25),
  entry("/vilkar/utleie","yearly",.25)
 ];

 const s=db();
 if(!s)return staticEntries;

 try{
  const nowIso=new Date().toISOString();
  const [products,categories,rentalItems,projects,services]=await Promise.all([
   s.from("products").select("slug,updated_at").eq("active",true),
   s.from("categories").select("slug,updated_at").eq("active",true),
   s.from("rental_items").select("slug,updated_at").eq("active",true).neq("status","hidden"),
   s.from("projects").select("slug,updated_at").eq("active",true),
   s.from("services").select("slug,updated_at,has_page,publish_from,publish_until").eq("active",true)
  ]);

  const dynamic=[];

  for(const row of products.data||[]){
   if(row.slug)dynamic.push(entry("/produkter/"+encodeURIComponent(row.slug),"weekly",.75,row.updated_at));
  }
  for(const row of categories.data||[]){
   if(row.slug)dynamic.push(entry("/produkter/kategori/"+encodeURIComponent(row.slug),"weekly",.65,row.updated_at));
  }
  for(const row of rentalItems.data||[]){
   if(row.slug)dynamic.push(entry("/utleie/"+encodeURIComponent(row.slug),"weekly",.7,row.updated_at));
  }
  for(const row of projects.data||[]){
   if(row.slug)dynamic.push(entry("/prosjekter/"+encodeURIComponent(row.slug),"monthly",.7,row.updated_at));
  }
  for(const row of services.data||[]){
   if(!row.slug||row.has_page!==true)continue;
   if(row.publish_from&&new Date(row.publish_from).toISOString()>nowIso)continue;
   if(row.publish_until&&new Date(row.publish_until).toISOString()<nowIso)continue;
   dynamic.push(entry("/tjenester/"+encodeURIComponent(row.slug),"monthly",.75,row.updated_at));
  }

  return staticEntries.concat(dynamic);
 }catch(error){
  console.error("SITEMAP ERROR",error);
  return staticEntries;
 }
}
