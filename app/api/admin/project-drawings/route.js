import {sameOriginGuard} from "../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {canReadProjectDrawings,canEditProjectDrawings} from "../../../../lib/projectDrawingPermissions";
async function allowed({write=false}={}){
 const user=await getAdminUser();
 return write?canEditProjectDrawings(user):canReadProjectDrawings(user);
}
const map=r=>({id:r.id,projectId:r.project_id||"",orderId:r.order_id||"",customerUserId:r.customer_user_id||"",customerContactId:r.customer_contact_id||"",customerVisible:r.customer_visible===true,name:r.name||"Ny tegning",customer:r.customer||"",address:r.address||"",notes:r.notes||"",drawingData:r.drawing_data||{},createdAt:r.created_at,updatedAt:r.updated_at});
const vals=b=>({project_id:b.projectId||null,order_id:b.orderId||null,customer_user_id:b.customerUserId||null,customer_contact_id:b.customerContactId||null,customer_visible:b.customerVisible===true,name:String(b.name||"Ny tegning").trim(),customer:String(b.customer||"").trim(),address:String(b.address||"").trim(),notes:String(b.notes||"").trim(),drawing_data:b.drawingData&&typeof b.drawingData==="object"?b.drawingData:{},updated_at:new Date().toISOString()});
const missing=e=>e?.code==="42P01";
export async function GET(req){
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const params=new URL(req.url).searchParams;
 const id=params.get("id");
 const projectId=params.get("projectId");
 const orderId=params.get("orderId");
 const customerUserId=params.get("customerUserId");
 const customerContactId=params.get("customerContactId");
 const summary=params.get("summary")==="1";
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 if(id){
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))return NextResponse.json({error:"Ugyldig tegning."},{status:400});
  const {data,error}=await s.from("project_drawings").select("*").eq("id",id).maybeSingle();
  if(error)return NextResponse.json({error:"Kunne ikke hente tegningen."},{status:500});
  if(!data)return NextResponse.json({error:"Tegningen ble ikke funnet."},{status:404});
  return NextResponse.json({drawing:map(data)},{headers:{"Cache-Control":"private, no-store"}});
 }
 const columns=summary
  ?"id,project_id,order_id,customer_user_id,customer_contact_id,customer_visible,name,customer,address,notes,created_at,updated_at"
  :"*";
 let q=s.from("project_drawings").select(columns).order("updated_at",{ascending:false}).limit(1000);
 if(orderId)q=q.eq("order_id",orderId);
 else if(projectId)q=q.eq("project_id",projectId);
 else if(customerContactId)q=q.eq("customer_contact_id",customerContactId);
 else if(customerUserId)q=q.eq("customer_user_id",customerUserId);
 const {data,error}=await q;
 if(error){
  if(missing(error))return NextResponse.json({drawings:[],setupRequired:true});
  return NextResponse.json({error:"Tegningene kunne ikke hentes."},{status:500});
 }
 if(!summary)return NextResponse.json({drawings:(data||[]).map(map)},{headers:{"Cache-Control":"private, no-store"}});
 // The archive only needs metadata: no large plans transmitted until editing.
 const rows=(data||[]).map(row=>({...map(row),drawingData:undefined}));
 // Query only the returned drawings. Paginate because the database API may
 // impose a lower row cap than the requested limit. Never infer private from error.
 const published=new Set();
 for(let start=0;start<rows.length;start+=100){
  const ids=rows.slice(start,start+100).map(row=>row.id);
  for(let offset=0;;offset+=500){
   const {data:publications,error:pubError}=await s.from("quote_drawing_publications")
    .select("id,drawing_id").in("drawing_id",ids).order("id",{ascending:true}).range(offset,offset+499);
   if(pubError||!Array.isArray(publications))
    return NextResponse.json({error:"Kunne ikke kontrollere hvilke tegninger som er delt med kunder. Prøv igjen."},{status:503,headers:{"Cache-Control":"private, no-store"}});
   for(const row of publications)if(row.drawing_id)published.add(row.drawing_id);
   if(publications.length<500)break;
  }
 }
 return NextResponse.json({drawings:rows,publishedIds:[...published]},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(req){ const originError=sameOriginGuard(req); if(originError)return originError;if(!(await allowed({write:true})))return NextResponse.json({error:"Kun ansatte med redigeringsrettighet kan endre eller slette tegninger."},{status:403});const b=await req.json();const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});const {data,error}=await s.from("project_drawings").insert(vals(b)).select("*").single();if(error){if(missing(error))return NextResponse.json({setupRequired:true,error:"Tegningslageret er ikke aktivert ennå."},{status:409});return NextResponse.json({error:error.message},{status:500})}return NextResponse.json({drawing:map(data)})}
export async function PATCH(req){ const originError=sameOriginGuard(req); if(originError)return originError;if(!(await allowed({write:true})))return NextResponse.json({error:"Kun ansatte med redigeringsrettighet kan endre eller slette tegninger."},{status:403});const b=await req.json();if(!b.id)return NextResponse.json({error:"Tegning mangler."},{status:400});const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});const {data,error}=await s.from("project_drawings").update(vals(b)).eq("id",b.id).select("*").single();if(error){if(missing(error))return NextResponse.json({setupRequired:true,error:"Tegningslageret er ikke aktivert ennå."},{status:409});return NextResponse.json({error:error.message},{status:500})}return NextResponse.json({drawing:map(data)})}
export async function DELETE(req){ const originError=sameOriginGuard(req); if(originError)return originError;if(!(await allowed({write:true})))return NextResponse.json({error:"Kun ansatte med redigeringsrettighet kan endre eller slette tegninger."},{status:403});const {id}=await req.json();if(!id)return NextResponse.json({error:"Tegning mangler."},{status:400});const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});const {error}=await s.from("project_drawings").delete().eq("id",id);if(error){if(missing(error))return NextResponse.json({setupRequired:true},{status:409});return NextResponse.json({error:error.message},{status:500})}return NextResponse.json({ok:true})}