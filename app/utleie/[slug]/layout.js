import {db} from "../../../lib/supabase";

async function getRentalItem(slug){
 const s=db();
 if(!s||!slug)return null;
 const {data,error}=await s
  .from("rental_items")
  .select("name,slug,description,image_urls,active,status")
  .eq("active",true)
  .neq("status","hidden")
  .eq("slug",slug)
  .maybeSingle();
 if(error)return null;
 return data||null;
}

export async function generateMetadata({params}){
 const resolved=await params;
 const slug=decodeURIComponent(String(resolved?.slug||""));
 const item=await getRentalItem(slug);

 if(!item){
  return {
   title:"Utleie",
   description:"Utleie fra Aadland Service.",
   robots:{index:false,follow:false}
  };
 }

 const title=item.name;
 const socialTitle=`${item.name} | Utleie | Aadland Service`;
 const description=String(item.description||`Lei ${item.name} hos Aadland Service.`).slice(0,180);
 const image=Array.isArray(item.image_urls)?item.image_urls[0]:null;
 const url=`https://www.aadland-service.no/utleie/${encodeURIComponent(item.slug)}`;

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
   ...(image?{images:[{url:image,alt:item.name}]}:{})
  },
  twitter:{
   card:image?"summary_large_image":"summary",
   title:socialTitle,
   description,
   ...(image?{images:[image]}:{})
  }
 };
}

export default function RentalItemLayout({children}){
 return children;
}
