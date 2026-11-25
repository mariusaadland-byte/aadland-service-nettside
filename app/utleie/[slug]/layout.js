import {db} from "../../../lib/supabase";
import {rentalProductMetadata} from "../../../lib/rentalSeo.mjs";

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
 const slug=String(resolved?.slug||"");
 const item=await getRentalItem(slug);

 if(!item){
  return {
   title:"Utleie",
   description:"Utleie fra Aadland Utleie.",
   robots:{index:false,follow:false}
  };
 }

 const {title,description,url,image}=rentalProductMetadata(item);
 const socialTitle=title+" | Aadland Utleie";

 return {
  title,
  description,
  alternates:{canonical:url},
  openGraph:{
   type:"website",
   locale:"nb_NO",
   siteName:"Aadland Utleie",
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
