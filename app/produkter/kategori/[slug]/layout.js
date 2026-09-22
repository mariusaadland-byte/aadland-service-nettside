import {db} from "../../../../lib/supabase";

async function getCategory(slug){
 const s=db();
 if(!s||!slug)return null;
 const {data,error}=await s
  .from("categories")
  .select("name,slug,description,image_url,active")
  .eq("active",true)
  .eq("slug",slug)
  .maybeSingle();
 if(error)return null;
 return data||null;
}

export async function generateMetadata({params}){
 const resolved=await params;
 const slug=decodeURIComponent(String(resolved?.slug||""));
 const category=await getCategory(slug);

 if(!category){
  return {
   title:"Produktkategori",
   description:"Produkter fra Aadland Service.",
   robots:{index:false,follow:false}
  };
 }

 const title=category.name;
 const socialTitle=`${category.name} | Aadland Service`;
 const description=String(category.description||`Se produkter i kategorien ${category.name} hos Aadland Service.`).slice(0,180);
 const url=`https://www.aadland-service.no/produkter/kategori/${encodeURIComponent(category.slug)}`;

 return {
  title,
  description,
  alternates:{canonical:url},
  openGraph:{
   type:"website",
   locale:"nb_NO",
   siteName:"Aadland Service",
   title:socialTitle,
   description,
   url,
   ...(category.image_url?{images:[{url:category.image_url,alt:category.name}]}:{})
  },
  twitter:{
   card:category.image_url?"summary_large_image":"summary",
   title:socialTitle,
   description,
   ...(category.image_url?{images:[category.image_url]}:{})
  }
 };
}

export default function CategoryLayout({children}){
 return children;
}
