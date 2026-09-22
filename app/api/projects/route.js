import {NextResponse} from "next/server";
import {db} from "../../../lib/supabase";

const map=p=>({
 id:p.id,
 title:p.title,
 slug:p.slug,
 category:p.category||"",
 description:p.description||"",
 imageUrls:Array.isArray(p.image_urls)?p.image_urls:[],
 contentBlocks:Array.isArray(p.content_blocks)?p.content_blocks:[],
 featured:p.featured!==false,
 active:p.active!==false,
 sortOrder:p.sort_order||0
});

export async function GET(request){
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const {searchParams}=new URL(request.url);
 const slug=String(searchParams.get("slug")||"").trim();
 const all=searchParams.get("all")==="1";

 if(slug){
  const {data,error}=await s.from("projects").select("*").eq("active",true).eq("slug",slug).maybeSingle();
  if(error){
   console.error("PROJECT GET ERROR:",error);
   if(error.code==="42P01")return NextResponse.json({project:null,setupRequired:true},{status:503});
   return NextResponse.json({error:"Prosjektet kunne ikke hentes."},{status:500});
  }
  if(!data)return NextResponse.json({project:null});

  const {data:listData,error:listError}=await s
   .from("projects")
   .select("id,title,slug,category,image_urls,sort_order,created_at")
   .eq("active",true)
   .order("sort_order")
   .order("created_at",{ascending:false});

  let previousProject=null;
  let nextProject=null;

  if(!listError&&Array.isArray(listData)&&listData.length>1){
   const currentIndex=listData.findIndex(item=>item.slug===data.slug);
   if(currentIndex>=0){
    const previous=currentIndex>0?listData[currentIndex-1]:null;
    const next=currentIndex<listData.length-1?listData[currentIndex+1]:null;
    const navMap=item=>item?{
     id:item.id,
     title:item.title,
     slug:item.slug,
     category:item.category||"",
     imageUrl:Array.isArray(item.image_urls)?item.image_urls[0]||"":"" 
    }:null;
    previousProject=navMap(previous);
    nextProject=navMap(next);
   }
  }

  return NextResponse.json({project:map(data),previousProject,nextProject});
 }

 let query=s.from("projects").select("*").eq("active",true).order("sort_order").order("created_at",{ascending:false});
 if(!all) query=query.eq("featured",true).limit(4);

 const {data,error}=await query;
 if(error){
  console.error("PROJECTS GET ERROR:",error);
  if(error.code==="42P01")return NextResponse.json({projects:[],setupRequired:true},{status:503});
  return NextResponse.json({error:"Prosjektene kunne ikke hentes."},{status:500});
 }

 return NextResponse.json({projects:(data||[]).map(map)});
}
