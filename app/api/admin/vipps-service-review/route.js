import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../lib/auth";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {db} from "../../../../lib/supabase";
import {getVippsPayment,getVippsPaymentEvents,vippsPaymentsEnabled} from "../../../../lib/vippsClient";

async function owner(){
 const user=await getAdminUser();
 return user?.role==="owner"?user:null;
}
export async function GET(req){
 if(!await owner())return NextResponse.json({error:"Bare eieren har tilgang."},{status:403});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const attemptId=new URL(req.url).searchParams.get("attemptId")||"";
 if(attemptId){
  if(!/^[0-9a-f-]{36}$/i.test(attemptId))return NextResponse.json({error:"Ugyldig forsøk."},{status:400});
  const {data:entry,error}=await s.from("vipps_service_action_attempts")
   .select("id,order_id,payment_reference,action,amount_ore,state,idempotency_key,claimed_at,last_issue")
   .eq("id",attemptId).maybeSingle();
  if(error||!entry)return NextResponse.json({error:"Fant ikke forsøket."},{status:404});
  if(!vippsPaymentsEnabled("service"))return NextResponse.json({error:"Vipps Service er ikke aktiv. Kontroller handlingen manuelt i Vipps-portalen."},{status:409});
  try{
   const [payment,events]=await Promise.all([
    getVippsPayment("service",entry.payment_reference),
    getVippsPaymentEvents("service",entry.payment_reference)
   ]);
   const list=Array.isArray(events)?events:Array.isArray(events?.events)?events.events:[];
   const visible=list.slice(-40).map(e=>({
    name:String(e.name||"").slice(0,40),success:e.success===true,
    amountOre:Number(e.amount?.value)||0,
    timestamp:String(e.timestamp||"").slice(0,50),
    matchesAttempt:e.idempotencyKey===entry.idempotency_key,
    idempotencyKey:e.idempotencyKey===entry.idempotency_key?entry.idempotency_key:null
   }));
   const aggregate=payment?.aggregate||{};
   return NextResponse.json({ok:true,entry,events:visible,
    aggregates:{
     capturedOre:Number(aggregate.capturedAmount?.value)||0,
     refundedOre:Number(aggregate.refundedAmount?.value)||0,
     cancelledOre:Number(aggregate.cancelledAmount?.value)||0,
     authorizedOre:Number(aggregate.authorizedAmount?.value)||0
    }
   },{headers:{"Cache-Control":"no-store"}});
  }catch{
   return NextResponse.json({error:"Vipps-hendelsene kunne ikke hentes. Forsøket er fortsatt sperret."},{status:503});
  }
 }
 const {data,error}=await s.from("vipps_service_action_attempts")
  .select("id,order_id,payment_reference,action,amount_ore,state,claimed_at,last_issue")
  .in("state",["sending","needs_review"]).order("claimed_at",{ascending:true}).limit(50);
 if(error)return NextResponse.json({error:"Kunne ikke hente kontrollisten."},{status:503});
 return NextResponse.json({attempts:data||[]},{headers:{"Cache-Control":"no-store"}});
}
export async function PATCH(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const admin=await owner();if(!admin)return NextResponse.json({error:"Bare eieren kan avklare usikre Vipps-handlinger."},{status:403});
 const body=await req.json().catch(()=>({}));
 const id=String(body.attemptId||"");
 const result=body.outcome;
 const phrase=result==="effect"?"UTFØRT I VIPPS":"IKKE UTFØRT";
 const note=String(body.note||"").trim(),evidence=String(body.evidence||"").trim();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||
  !["effect","no_effect"].includes(result)||body.confirmation!==phrase||
  note.length<16||note.length>1200||evidence.length<8||evidence.length>240)
  return NextResponse.json({error:"Kontroller Vipps, fyll inn referanse, begrunnelse og korrekt bekreftelsestekst."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er utilgjengelig."},{status:503});
 const {data,error}=await s.rpc("review_vipps_service_action",{
  p_attempt_id:id,p_reviewer_id:admin.id,p_result:result,
  p_note:note,p_evidence:evidence
 });
 if(error)return NextResponse.json({error:"Forsøket kunne ikke avklares. Kontroller Vipps og vent minst fem minutter."},{status:409});
 return NextResponse.json({ok:data?.reviewed===true,state:data?.state});
}
