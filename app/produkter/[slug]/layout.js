import {db} from "../../../lib/supabase";

async function getProduct(slug){
 const s=db();
 if(!s||!slug)return null;
 const {data,error}=await s
  .from("products")
  .select("name,slug,description,image_url,image_urls,active")
  .eq("active",true)
  .eq("slug",slug)
  .maybeSingle();
 if(error)return null;
 return data||null;
}

export async function generateMetadata({params}){
 const resolved=await params;
 const slug=decodeURIComponent(String(resolved?.slug||""));
 const product=await getProduct(slug);

 if(!product){
  return {
   title:"Produkt",
   description:"Produkt fra Aadland Service.",
   robots:{index:false,follow:false}
  };
 }

 const title=product.name;
 const socialTitle=`${product.name} | Aadland Service`;
 const description=String(product.description||`Se ${product.name} fra Aadland Service.`).slice(0,180);
 const images=Array.isArray(product.image_urls)?product.image_urls:[];
 const image=images[0]||product.image_url||null;
 const url=`https://www.aadland-service.no/produkter/${encodeURIComponent(product.slug)}`;

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
   ...(image?{images:[{url:image,alt:product.name}]}:{})
  },
  twitter:{
   card:image?"summary_large_image":"summary",
   title:socialTitle,
   description,
   ...(image?{images:[image]}:{})
  }
 };
}

export default function ProductLayout({children}){
 return children;
}
