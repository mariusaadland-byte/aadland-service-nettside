import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {isValidDateInput,osloDateKey} from "../../../../lib/osloTime";

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SELECT_FIELDS="id,admin_user_id,order_id,work_date,project_label,customer_label,note,started_at,ended_at,duration_minutes,hourly_rate_ore,distance_km,km_rate_ore,toll_ore,created_at,updated_at";

async function allowed(){
 const user=await getAdminUser();
 if(!user)return null;
 return user.role==="owner"||user.canUpdateOrders?user:null;
}
function clean(value,max=500){
 return String(value??"").trim().slice(0,max);
}
function integer(value,min=0,max=100000000){
 const number=Number(value);
 if(!Number.isFinite(number))return min;
 return Math.max(min,Math.min(max,Math.round(number)));
}
function decimal(value,min=0,max=1000000){
 const number=Number(value);
 if(!Number.isFinite(number))return min;
 return Math.max(min,Math.min(max,Math.round(number*100)/100));
}
function orderId(value){
 const id=clean(value,80);
 return UUID_RE.test(id)?id:null;
}
function map(row){
 if(!row)return null;
 return {
  id:row.id,
  orderId:row.order_id||null,
  workDate:row.work_date,
  projectLabel:row.project_label||"",
  customerLabel:row.customer_label||"",
  note:row.note||"",
  startedAt:row.started_at||null,
  endedAt:row.ended_at||null,
  durationMinutes:Number(row.duration_minutes)||0,
  hourlyRateOre:Number(row.hourly_rate_ore)||0,
  distanceKm:Number(row.distance_km)||0,
  kmRateOre:Number(row.km_rate_ore)||0,
  tollOre:Number(row.toll_ore)||0,
  createdAt:row.created_at,
  updatedAt:row.updated_at
 };
}
function tableError(error){
 const code=String(error?.code||"");
 const message=String(error?.message||"");
 return code==="42P01"||code==="PGRST205"||message.includes("work_time_entries");
}
function monthBounds(value){
 const month=String(value||"");
 if(!/^\d{4}-\d{2}$/.test(month))return null;
 const [year,monthNo]=month.split("-").map(Number);
 if(year<2020||year>2100||monthNo<1||monthNo>12)return null;
 const next=new Date(Date.UTC(year,monthNo,1));
 return {
  first:month+"-01",
  next:next.toISOString().slice(0,7)+"-01"
 };
}
function commonValues(body){
 return {
  order_id:orderId(body.orderId),
  project_label:clean(body.projectLabel,180),
  customer_label:clean(body.customerLabel,180),
  note:clean(body.note,2000),
  hourly_rate_ore:integer(body.hourlyRateOre,0,10000000),
  distance_km:decimal(body.distanceKm,0,1000000),
  km_rate_ore:integer(body.kmRateOre,0,100000),
  toll_ore:integer(body.tollOre,0,100000000),
  updated_at:new Date().toISOString()
 };
}

export async function GET(req){
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const requested=new URL(req.url).searchParams.get("month")||osloDateKey(new Date()).slice(0,7);
 const bounds=monthBounds(requested);
 if(!bounds)return NextResponse.json({error:"Ugyldig måned."},{status:400});

 const [entriesResult,activeResult]=await Promise.all([
  s.from("work_time_entries")
   .select(SELECT_FIELDS)
   .eq("admin_user_id",user.id)
   .gte("work_date",bounds.first)
   .lt("work_date",bounds.next)
   .order("work_date",{ascending:false})
   .order("created_at",{ascending:false}),
  s.from("work_time_entries")
   .select(SELECT_FIELDS)
   .eq("admin_user_id",user.id)
   .not("started_at","is",null)
   .is("ended_at",null)
   .maybeSingle()
 ]);

 const error=entriesResult.error||activeResult.error;
 if(error){
  if(tableError(error))return NextResponse.json({entries:[],active:null,setupRequired:true},{status:503});
  console.error("WORK TIME GET",error);
  return NextResponse.json({error:"Arbeidstiden kunne ikke hentes."},{status:500});
 }
 return NextResponse.json({
  month:requested,
  entries:(entriesResult.data||[]).map(map),
  active:map(activeResult.data)
 });
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json().catch(()=>({}));
 const action=clean(body.action,30);
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const values=commonValues(body);
 values.admin_user_id=user.id;

 if(action==="start"){
  values.work_date=osloDateKey(new Date());
  values.started_at=new Date().toISOString();
  values.ended_at=null;
  values.duration_minutes=0;
 }else if(action==="manual"){
  const workDate=clean(body.workDate,10);
  const durationMinutes=integer(body.durationMinutes,0,100000);
  if(!isValidDateInput(workDate))return NextResponse.json({error:"Velg en gyldig dato."},{status:400});
  if(durationMinutes<1)return NextResponse.json({error:"Registrer minst ett minutt arbeidstid."},{status:400});
  values.work_date=workDate;
  values.started_at=null;
  values.ended_at=null;
  values.duration_minutes=durationMinutes;
 }else{
  return NextResponse.json({error:"Ukjent handling."},{status:400});
 }

 const {data,error}=await s.from("work_time_entries").insert(values).select(SELECT_FIELDS).single();
 if(error){
  if(tableError(error))return NextResponse.json({error:"Databaseoppdatering mangler for arbeidsklokken.",setupRequired:true},{status:503});
  if(String(error.code||"")==="23505")return NextResponse.json({error:"Du har allerede en arbeidsklokke som går."},{status:409});
  console.error("WORK TIME POST",error);
  return NextResponse.json({error:"Registreringen kunne ikke lagres."},{status:500});
 }
 return NextResponse.json({entry:map(data)});
}

export async function PATCH(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json().catch(()=>({}));
 const id=clean(body.id,80);
 const action=clean(body.action,30);
 if(!UUID_RE.test(id))return NextResponse.json({error:"Registreringen mangler."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const existingResult=await s.from("work_time_entries").select(SELECT_FIELDS).eq("id",id).eq("admin_user_id",user.id).maybeSingle();
 if(existingResult.error){
  if(tableError(existingResult.error))return NextResponse.json({error:"Databaseoppdatering mangler for arbeidsklokken.",setupRequired:true},{status:503});
  return NextResponse.json({error:"Registreringen kunne ikke hentes."},{status:500});
 }
 const existing=existingResult.data;
 if(!existing)return NextResponse.json({error:"Registreringen ble ikke funnet."},{status:404});

 let values;
 if(action==="stop"){
  if(!existing.started_at||existing.ended_at)return NextResponse.json({error:"Denne klokken går ikke."},{status:409});
  const endedAt=new Date();
  const startedAt=new Date(existing.started_at);
  const durationMinutes=Math.max(1,Math.round((endedAt.getTime()-startedAt.getTime())/60000));
  values={ended_at:endedAt.toISOString(),duration_minutes:durationMinutes,updated_at:endedAt.toISOString()};
 }else if(action==="update"){
  if(existing.started_at&&!existing.ended_at)return NextResponse.json({error:"Stopp klokken før du redigerer registreringen."},{status:409});
  const workDate=clean(body.workDate,10);
  const durationMinutes=integer(body.durationMinutes,0,100000);
  if(!isValidDateInput(workDate))return NextResponse.json({error:"Velg en gyldig dato."},{status:400});
  if(durationMinutes<1)return NextResponse.json({error:"Registrer minst ett minutt arbeidstid."},{status:400});
  values={...commonValues(body),work_date:workDate,duration_minutes:durationMinutes};
 }else{
  return NextResponse.json({error:"Ukjent handling."},{status:400});
 }

 const {data,error}=await s.from("work_time_entries").update(values).eq("id",id).eq("admin_user_id",user.id).select(SELECT_FIELDS).single();
 if(error){
  console.error("WORK TIME PATCH",error);
  return NextResponse.json({error:"Registreringen kunne ikke oppdateres."},{status:500});
 }
 return NextResponse.json({entry:map(data)});
}

export async function DELETE(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json().catch(()=>({}));
 const id=clean(body.id,80);
 if(!UUID_RE.test(id))return NextResponse.json({error:"Registreringen mangler."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const existing=await s.from("work_time_entries")
  .select("id,started_at,ended_at").eq("id",id).eq("admin_user_id",user.id).maybeSingle();
 if(existing.error){
  if(tableError(existing.error))return NextResponse.json({error:"Databaseoppdatering mangler for arbeidsklokken.",setupRequired:true},{status:503});
  return NextResponse.json({error:"Registreringen kunne ikke hentes."},{status:500});
 }
 if(!existing.data)return NextResponse.json({error:"Registreringen ble ikke funnet."},{status:404});
 if(existing.data.started_at&&!existing.data.ended_at)return NextResponse.json({error:"En aktiv klokke må stoppes før den kan slettes."},{status:409});
 const {error}=await s.from("work_time_entries").delete().eq("id",id).eq("admin_user_id",user.id);
 if(error){
  console.error("WORK TIME DELETE",error);
  return NextResponse.json({error:"Registreringen kunne ikke slettes."},{status:500});
 }
 return NextResponse.json({ok:true});
}
