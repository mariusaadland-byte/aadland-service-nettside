import {db} from "../../../lib/supabase";

async function getService(slug){
 const s=db();
 if(!s||!slug)return null;
 const {data,error}=await s
  .from("services")
  .select("title,slug,description,image_url,active,has_page,publish_from,publish_until")
  .eq("active",true)
  .eq("slug",slug)
  .maybeSingle();
 if(error||!data||data.has_page!==true)return null;

 const now=Date.now();
 if(data.publish_from&&new Date(data.publish_from).getTime()>now)return null;
 if(data.publish_until&&new Date(data.publish_until).getTime()<now)return null;
 return data;
}

export async function generateMetadata({params}){
 const resolved=await params;
 const slug=decodeURIComponent(String(resolved?.slug||""));
 const service=await getService(slug);

 if(!service){
  return {
   title:"Tjeneste",
   description:"Tjeneste fra Aadland Service.",
   robots:{index:false,follow:false}
  };
 }

 const title=service.title;
 const socialTitle=`${service.title} | Aadland Service`;
 const description=String(service.description||`Les mer om ${service.title} fra Aadland Service.`).slice(0,180);
 const url=`https://www.aadland-service.no/tjenester/${encodeURIComponent(service.slug)}`;

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
   ...(service.image_url?{images:[{url:service.image_url,alt:service.title}]}:{})
  },
  twitter:{
   card:service.image_url?"summary_large_image":"summary",
   title:socialTitle,
   description,
   ...(service.image_url?{images:[service.image_url]}:{})
  }
 };
}

export default function ServiceLayout({children}){
 return children;
}
