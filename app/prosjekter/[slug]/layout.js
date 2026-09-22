import { db } from "../../../lib/supabase";

async function getProject(slug){
 const s=db();
 if(!s||!slug)return null;
 const {data,error}=await s
  .from("projects")
  .select("title,slug,category,description,image_urls,active")
  .eq("active",true)
  .eq("slug",slug)
  .maybeSingle();
 if(error)return null;
 return data||null;
}

export async function generateMetadata({params}){
 const resolved=await params;
 const slug=decodeURIComponent(String(resolved?.slug||""));
 const project=await getProject(slug);

 if(!project){
  return {
   title:"Prosjekt",
   description:"Tidligere oppdrag utført av Aadland Service.",
   robots:{index:false,follow:false}
  };
 }

 const title=project.title;
 const socialTitle=`${project.title} | Aadland Service`;
 const description=String(project.description||`Se bilder og informasjon fra ${project.title}, utført av Aadland Service.`).slice(0,180);
 const image=Array.isArray(project.image_urls)&&project.image_urls[0]?project.image_urls[0]:null;
 const url=`https://www.aadland-service.no/prosjekter/${encodeURIComponent(project.slug)}`;

 return {
  title,
  description,
  alternates:{canonical:url},
  openGraph:{
   type:"article",
   locale:"nb_NO",
   siteName:"Aadland Service",
   title:socialTitle,
   description,
   url,
   ...(image?{images:[{url:image,alt:project.title}]}:{})
  },
  twitter:{
   card:image?"summary_large_image":"summary",
   title:socialTitle,
   description,
   ...(image?{images:[image]}:{})
  }
 };
}

export default function ProjectLayout({children}){
 return children;
}
