import {db} from "../lib/supabase";

export default async function sitemap(){
 const base="https://www.aadland-service.no";
 const staticRoutes=[
  {path:"",priority:1,changeFrequency:"weekly"},
  {path:"/tjenester",priority:.8,changeFrequency:"monthly"},
  {path:"/produkter",priority:.8,changeFrequency:"weekly"},
  {path:"/utleie",priority:.8,changeFrequency:"weekly"},
  {path:"/prosjekter",priority:.85,changeFrequency:"weekly"},
  {path:"/personvern",priority:.4,changeFrequency:"yearly"},
  {path:"/vilkar/salg",priority:.4,changeFrequency:"yearly"},
  {path:"/vilkar/utleie",priority:.4,changeFrequency:"yearly"}
 ];

 const routes=staticRoutes.map(route=>({
  url:base+route.path,
  changeFrequency:route.changeFrequency,
  priority:route.priority
 }));

 try{
  const s=db();
  if(!s)return routes;
  const {data,error}=await s
   .from("projects")
   .select("slug,updated_at,created_at")
   .eq("active",true)
   .order("sort_order")
   .order("created_at",{ascending:false});

  if(error||!Array.isArray(data))return routes;

  return routes.concat(data
   .filter(project=>project.slug)
   .map(project=>({
    url:base+"/prosjekter/"+encodeURIComponent(project.slug),
    lastModified:project.updated_at||project.created_at||undefined,
    changeFrequency:"monthly",
    priority:.72
   })));
 }catch{
  return routes;
 }
}
