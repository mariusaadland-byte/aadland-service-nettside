import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";

async function allowed(){
 const user=await getAdminUser();
 if(!user)return null;
 return (user.role==="owner"||user.canUpdateOrders||user.canManageProducts)?user:null;
}

function revisionNumber(base,nextRevision){
 return String(base||"TILB").replace(/-R\d+$/i,"")+"-R"+nextRevision;
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});

 const {id}=await req.json().catch(()=>({}));
 if(!id)return NextResponse.json({error:"Tilbud mangler."},{status:400});

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const {data:source,error:sourceError}=await s.from("quotes").select("*").eq("id",id).maybeSingle();
 if(sourceError||!source)return NextResponse.json({error:"Tilbudet ble ikke funnet."},{status:404});

 if(!["sent","expired"].includes(source.status)){
  return NextResponse.json({error:"Bare sendte eller utløpte tilbud kan få en ny revisjon."},{status:409});
 }
 if(source.superseded_by_id){
  return NextResponse.json({error:"Det finnes allerede en nyere revisjon.",quoteId:source.superseded_by_id},{status:409});
 }

 const seriesId=source.revision_series_id||source.id;
 const {data:series,error:seriesError}=await s.from("quotes")
  .select("id,quote_number,status,revision_number,revised_from_id,created_at")
  .eq("revision_series_id",seriesId)
  .order("revision_number",{ascending:false});
 if(seriesError)return NextResponse.json({error:"Revisjonshistorikken kunne ikke hentes."},{status:500});

 const latest=(series||[])[0]||null;
 if(latest&&latest.id!==source.id&&latest.status==="draft"){
  return NextResponse.json({ok:true,quoteId:latest.id,quoteNumber:latest.quote_number,revisionNumber:latest.revision_number,reused:true});
 }
 if(latest&&latest.id!==source.id&&!["superseded","cancelled"].includes(latest.status)){
  return NextResponse.json({error:"Det finnes allerede en nyere aktiv revisjon.",quoteId:latest.id},{status:409});
 }

 const nextRevision=Math.max(1,...(series||[]).map(row=>Number(row.revision_number)||1))+1;
 const quoteNumber=revisionNumber(source.quote_number,nextRevision);
 const now=new Date().toISOString();

 const record={
  quote_number:quoteNumber,
  status:"draft",
  title:source.title,
  customer:source.customer||{},
  line_items:Array.isArray(source.line_items)?source.line_items:[],
  payment_plan:Array.isArray(source.payment_plan)?source.payment_plan:[],
  drawing_ids:Array.isArray(source.drawing_ids)?source.drawing_ids:[],
  subtotal_ex_vat_ore:Number(source.subtotal_ex_vat_ore)||0,
  vat_ore:Number(source.vat_ore)||0,
  total_inc_vat_ore:Number(source.total_inc_vat_ore)||0,
  intro_text:source.intro_text||null,
  notes:source.notes||null,
  terms:source.terms||null,
  valid_until:source.valid_until||null,
  planned_start_date:source.planned_start_date||null,
  source_order_id:source.source_order_id||null,
  created_by:user.id,
  auto_follow_up:source.auto_follow_up!==false,
  revision_series_id:seriesId,
  revision_number:nextRevision,
  revised_from_id:source.id,
  superseded_by_id:null,
  superseded_at:null,
  sent_at:null,
  accepted_at:null,
  declined_at:null,
  archived_at:null,
  converted_order_id:null,
  follow_up_sent_at:null,
  created_at:now,
  updated_at:now
 };

 const {data:created,error:createError}=await s.from("quotes").insert(record).select("id,quote_number,revision_number").single();
 if(createError){
  if(String(createError.code||"")==="23505"){
   const {data:existing}=await s.from("quotes")
    .select("id,quote_number,revision_number")
    .eq("revision_series_id",seriesId)
    .eq("revision_number",nextRevision)
    .maybeSingle();
   if(existing)return NextResponse.json({ok:true,quoteId:existing.id,quoteNumber:existing.quote_number,revisionNumber:existing.revision_number,reused:true});
  }
  console.error("QUOTE REVISION CREATE",createError);
  return NextResponse.json({error:"Ny revisjon kunne ikke opprettes."},{status:500});
 }

 return NextResponse.json({ok:true,quoteId:created.id,quoteNumber:created.quote_number,revisionNumber:created.revision_number});
}
