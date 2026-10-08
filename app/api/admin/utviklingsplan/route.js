import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {DEVELOPMENT_TASKS,DEVELOPMENT_GROUPS,DEVELOPMENT_STATUSES,DEVELOPMENT_PRIORITIES} from "../../../../lib/developmentTasks";

const TABLE="admin_development_tasks";
const GROUPS=new Set(DEVELOPMENT_GROUPS.map(group=>group.id));
const STATUSES=new Set(DEVELOPMENT_STATUSES);
const PRIORITIES=new Set(DEVELOPMENT_PRIORITIES);
const FIELDS="id,title,description,category,priority,status,notes,sort_order,is_custom,created_at,updated_at";

async function owner(){
 const user=await getAdminUser();
 return user?.role==="owner"?user:null;
}
const clean=(value,max)=>String(value??"").trim().slice(0,max);
function mapRow(row){
 return {id:row.id,title:row.title,description:row.description,category:row.category,priority:row.priority,status:row.status,notes:row.notes||"",sortOrder:row.sort_order,custom:row.is_custom===true,updatedAt:row.updated_at};
}
function errorResponse(error,message){
 console.error("ADMIN ROADMAP",error);
 return NextResponse.json({error:message},{status:500});
}
export async function GET(){
 if(!await owner())return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data,error}=await s.from(TABLE).select(FIELDS).order("sort_order",{ascending:true});
 if(error)return errorResponse(error,"Utviklingsplanen kunne ikke hentes. Kontroller at databasen er oppdatert.");
 const saved=new Map((data||[]).map(row=>[row.id,mapRow(row)]));
 const tasks=DEVELOPMENT_TASKS.map(item=>({...item,...(saved.get(item.id)||{})}));
 const custom=(data||[]).filter(row=>row.is_custom&&!DEVELOPMENT_TASKS.some(item=>item.id===row.id)).map(mapRow);
 return NextResponse.json({tasks:[...tasks,...custom],groups:DEVELOPMENT_GROUPS});
}
export async function POST(request){
 const guard=sameOriginGuard(request);if(guard)return guard;
 if(!await owner())return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await request.json().catch(()=>({}));
 const title=clean(body.title,150),description=clean(body.description,1400),category=clean(body.category,40);
 if(!title)return NextResponse.json({error:"Skriv navn på oppgaven."},{status:400});
 if(!GROUPS.has(category))return NextResponse.json({error:"Velg en gyldig gruppe."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const row={id:"custom-"+randomUUID(),title,description,category,priority:PRIORITIES.has(body.priority)?body.priority:"normal",status:"todo",notes:"",sort_order:1000,is_custom:true,updated_at:new Date().toISOString()};
 const {data,error}=await s.from(TABLE).insert(row).select(FIELDS).single();
 if(error)return errorResponse(error,"Oppgaven kunne ikke opprettes.");
 return NextResponse.json({task:mapRow(data)}, {status:201});
}
export async function PATCH(request){
 const guard=sameOriginGuard(request);if(guard)return guard;
 if(!await owner())return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await request.json().catch(()=>({})),id=clean(body.id,100);
 if(!id)return NextResponse.json({error:"Velg en oppgave."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const initial=DEVELOPMENT_TASKS.find(item=>item.id===id);
 const {data:stored,error:findError}=await s.from(TABLE).select(FIELDS).eq("id",id).maybeSingle();
 if(findError)return errorResponse(findError,"Oppgaven kunne ikke leses.");
 if(!initial&&!stored)return NextResponse.json({error:"Oppgaven finnes ikke."},{status:404});
 const existing=stored?mapRow(stored):initial;
 const priority=body.priority===undefined?existing.priority:clean(body.priority,30);
 const status=body.status===undefined?existing.status:clean(body.status,30);
 const category=body.category===undefined?existing.category:clean(body.category,40);
 if(!PRIORITIES.has(priority)||!STATUSES.has(status)||!GROUPS.has(category))return NextResponse.json({error:"Ugyldig status, prioritet eller gruppe."},{status:400});
 const payload={
  id,title:body.title===undefined?existing.title:clean(body.title,150),
  description:body.description===undefined?existing.description:clean(body.description,1400),
  category,priority,status,notes:body.notes===undefined?existing.notes:clean(body.notes,3000),
  sort_order:existing.sortOrder,is_custom:existing.custom===true,updated_at:new Date().toISOString()
 };
 if(!payload.title)return NextResponse.json({error:"Oppgaven må ha et navn."},{status:400});
 const {data,error}=await s.from(TABLE).upsert(payload,{onConflict:"id"}).select(FIELDS).single();
 if(error)return errorResponse(error,"Endringen kunne ikke lagres.");
 return NextResponse.json({task:mapRow(data)});
}
export async function DELETE(request){
 const guard=sameOriginGuard(request);if(guard)return guard;
 if(!await owner())return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const id=clean(new URL(request.url).searchParams.get("id"),100);
 if(!id.startsWith("custom-"))return NextResponse.json({error:"Bare egne oppgaver kan slettes."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {error}=await s.from(TABLE).delete().eq("id",id).eq("is_custom",true);
 if(error)return errorResponse(error,"Oppgaven kunne ikke slettes.");
 return NextResponse.json({ok:true});
}
