import {db} from "../lib/supabase";

export const revalidate=3600;

const base="https://www.aadland-service.no";

function route(path,priority,changeFrequency,lastModified){
 return {
  url:base+path,
  changeFrequency,
  priority,
  ...(lastModified?{lastModified}:{})
 };
}

function validSlug(value){
 return typeof value==="string"&&value.trim().length>0;
}

export default async function sitemap(){
 const routes=[
  route("",1,"weekly"),
  route("/produkter",.85,"weekly"),
  route("/utleie",.8,"weekly"),
  route("/prosjekter",.85,"weekly"),
  route("/personvern",.4,"yearly"),
  route("/vilkar/salg",.4,"yearly"),
  route("/vilkar/utleie",.4,"yearly")
 ];

 try{
  const s=db();
  if(!s)return routes;

  const [servicesResult,categoriesResult,productsResult,projectsResult]=await Promise.all([
   s.from("services").select("slug,has_page,publish_from,publish_until,updated_at,created_at").eq("active",true),
   s.from("categories").select("slug,updated_at,created_at").eq("active",true),
   s.from("products").select("slug,updated_at,created_at").eq("active",true),
   s.from("projects").select("slug,updated_at,created_at").eq("active",true)
  ]);

  const now=Date.now();

  if(!servicesResult.error&&Array.isArray(servicesResult.data)){
   servicesResult.data
    .filter(service=>service.has_page===true&&validSlug(service.slug))
    .filter(service=>!service.publish_from||new Date(service.publish_from).getTime()<=now)
    .filter(service=>!service.publish_until||new Date(service.publish_until).getTime()>=now)
    .forEach(service=>routes.push(route(
     "/tjenester/"+encodeURIComponent(service.slug),
     .78,
     "monthly",
     service.updated_at||service.created_at||undefined
    )));
  }

  if(!categoriesResult.error&&Array.isArray(categoriesResult.data)){
   categoriesResult.data
    .filter(category=>validSlug(category.slug))
    .forEach(category=>routes.push(route(
     "/produkter/kategori/"+encodeURIComponent(category.slug),
     .72,
     "weekly",
     category.updated_at||category.created_at||undefined
    )));
  }

  if(!productsResult.error&&Array.isArray(productsResult.data)){
   productsResult.data
    .filter(product=>validSlug(product.slug))
    .forEach(product=>routes.push(route(
     "/produkter/"+encodeURIComponent(product.slug),
     .76,
     "weekly",
     product.updated_at||product.created_at||undefined
    )));
  }

  if(!projectsResult.error&&Array.isArray(projectsResult.data)){
   projectsResult.data
    .filter(project=>validSlug(project.slug))
    .forEach(project=>routes.push(route(
     "/prosjekter/"+encodeURIComponent(project.slug),
     .72,
     "monthly",
     project.updated_at||project.created_at||undefined
    )));
  }

  return routes;
 }catch{
  return routes;
 }
}
