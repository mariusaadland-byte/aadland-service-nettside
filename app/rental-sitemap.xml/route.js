import {db} from "../../lib/supabase";

const base="https://www.aadlandutleie.no";

function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"}[ch]));
}

function entry(url,{lastModified,changeFrequency="weekly",priority=".7"}={}){
 return `<url><loc>${esc(url)}</loc>${lastModified?`<lastmod>${esc(new Date(lastModified).toISOString())}</lastmod>`:""}<changefreq>${changeFrequency}</changefreq><priority>${priority}</priority></url>`;
}

export async function GET(){
 const urls=[
  entry(base+"/",{changeFrequency:"weekly",priority:"1.0"}),
  entry(base+"/vilkar/utleie",{changeFrequency:"yearly",priority:".4"})
 ];

 try{
  const s=db();
  if(s){
   const {data,error}=await s.from("rental_items")
    .select("slug,updated_at,created_at")
    .eq("active",true)
    .neq("status","hidden")
    .order("sort_order");
   if(!error){
    for(const item of data||[]){
     const slug=String(item.slug||"").trim();
     if(!slug)continue;
     urls.push(entry(base+"/utleie/"+encodeURIComponent(slug),{
      lastModified:item.updated_at||item.created_at,
      changeFrequency:"weekly",
      priority:".8"
     }));
    }
   }
  }
 }catch{}

 const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;
 return new Response(xml,{
  headers:{
   "Content-Type":"application/xml; charset=utf-8",
   "Cache-Control":"public, s-maxage=3600, stale-while-revalidate=86400"
  }
 });
}
