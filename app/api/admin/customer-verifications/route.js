import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";

async function owner(){
 const user=await getAdminUser();
 return user?.role==="owner"?user:null;
}
export async function GET(){
 const admin=await owner();
 if(!admin)return NextResponse.json({error:"Bare eieren har tilgang."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er utilgjengelig."},{status:503});
 const {data,error,count}=await s.from("customer_verification_delivery_attempts")
  .select("id,recipient_email,state,claimed_at,issue",{count:"exact"})
  .in("state",["sending","needs_review"]).order("claimed_at",{ascending:true}).order("id",{ascending:true}).limit(50);
 if(error||!Array.isArray(data)||!Number.isSafeInteger(count)||count<data.length)return NextResponse.json({error:"Sendeloggen kunne ikke hentes."},{status:503});
 return NextResponse.json({attempts:data,total:count,hasMore:count>data.length},{headers:{"Cache-Control":"no-store"}});
}
export async function PATCH(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const admin=await owner();
 if(!admin)return NextResponse.json({error:"Bare eieren kan kontrollere ukjente sendeforsøk."},{status:403});
 const body=await req.json().catch(()=>({}));
 const attemptId=String(body.attemptId||"");
 const outcome=body.outcome;
 const note=String(body.note||"").trim();
 const providerId=String(body.providerId||"").trim();
 const phrase=outcome==="sent"?"BEKREFTET I RESEND":"IKKE SENDT";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId)||
  !["sent","unsent"].includes(outcome)||body.confirmation!==phrase||
  note.length<12||note.length>1200||
  (outcome==="sent"&&(providerId.length<8||providerId.length>240)))
  return NextResponse.json({error:"Kontroller Resend og fyll inn korrekt resultat, bekreftelse og begrunnelse."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er utilgjengelig."},{status:503});
 const {data,error}=await s.rpc("review_customer_verification_delivery",{
  p_attempt_id:attemptId,p_reviewer_id:admin.id,p_result:outcome,
  p_note:note,p_provider_id:outcome==="sent"?providerId:null
 });
 if(error)return NextResponse.json({
  error:"Sendeforsøket kunne ikke avklares. Kontroller Resend og vent minst fem minutter."
 },{status:409});
 return NextResponse.json({ok:data?.reviewed===true,state:data?.state});
}
