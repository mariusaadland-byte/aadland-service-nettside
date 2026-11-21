import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";

export const runtime="nodejs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function allowed(){
 const user=await getAdminUser();
 if(!user)return null;
 return user.role==="owner"||user.canUpdateOrders||user.canManageProducts?user:null;
}

export async function GET(req){
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const id=String(new URL(req.url).searchParams.get("id")||"");
 if(!UUID.test(id))return NextResponse.json({error:"Ugyldig tilbuds-ID."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const [q,a]=await Promise.all([
  s.from("quotes").select("id,quote_number,status,auto_follow_up,follow_up_sent_at").eq("id",id).maybeSingle(),
  s.from("quote_followup_dispatches").select("recipient,state,provider_email_id,claimed_at,provider_accepted_at,sent_at,updated_at,reviewed_at,last_error").eq("quote_id",id).maybeSingle()
 ]);
 if(q.error||a.error)return NextResponse.json({error:"Kunne ikke hente påminnelsesstatus."},{status:503});
 if(!q.data)return NextResponse.json({error:"Tilbudet finnes ikke."},{status:404});
 return NextResponse.json({
  quoteNumber:q.data.quote_number,quoteStatus:q.data.status,autoFollowUp:q.data.auto_follow_up,
  followUpSentAt:q.data.follow_up_sent_at,attempt:a.data||null,
  canReview:user.role==="owner"
 },{headers:{"Cache-Control":"no-store"}});
}

export async function PATCH(req){
 const originError=sameOriginGuard(req);if(originError)return originError;
 const user=await getAdminUser();
 if(user?.role!=="owner")
  return NextResponse.json({error:"Bare eier kan bekrefte uavklarte påminnelser."},{status:403});
 const body=await req.json().catch(()=>({}));
 const id=String(body.id||"");
 if(!UUID.test(id))return NextResponse.json({error:"Ugyldig tilbuds-ID."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 if(body.action==="finalize"){
  const {data:a,error:lookupError}=await s.from("quote_followup_dispatches")
   .select("state,idempotency_key").eq("quote_id",id).maybeSingle();
  if(lookupError||a?.state!=="provider_accepted")
   return NextResponse.json({error:"Ingen leverandørbekreftet påminnelse kan sluttføres."},{status:409});
  const done=await s.rpc("complete_quote_followup",{p_quote_id:id,p_key:a.idempotency_key});
  if(done.error)return NextResponse.json({error:"Registreringen kunne ikke fullføres. Ingen ny e-post er sendt."},{status:503});
  return NextResponse.json({ok:true,state:"sent",sentAt:done.data?.sentAt});
 }

 if(!["release_unsent","confirm_sent"].includes(body.action))
  return NextResponse.json({error:"Ukjent kontrollhandling."},{status:400});
 const confirmation=String(body.confirmation||"");
 if(body.action==="release_unsent"&&confirmation!=="IKKE SENDT"||
    body.action==="confirm_sent"&&confirmation!=="BEKREFTET I RESEND")
  return NextResponse.json({error:"Kontroller leveringsstatus hos Resend og bekreft eksplisitt."},{status:400});
 const note=String(body.note||"").trim();
 if(note.length<12||note.length>1200)return NextResponse.json({error:"Skriv en begrunnelse på 12–1200 tegn."},{status:400});
 const providerEmailId=String(body.providerEmailId||"").trim();
 if(body.action==="confirm_sent"&&(providerEmailId.length<8||providerEmailId.length>240))
  return NextResponse.json({error:"Legg inn bekreftet meldings-ID fra Resend."},{status:400});
 const reviewed=await s.rpc("review_quote_followup",{
  p_quote_id:id,p_quote_number:String(body.quoteNumber||""),p_reviewer:user.id,
  p_action:body.action,p_confirmation:confirmation,p_note:note,
  p_provider_email_id:body.action==="confirm_sent"?providerEmailId:null
 });
 if(reviewed.error){
  const msg=String(reviewed.error.message||"");
  return NextResponse.json({error:msg.includes("followup_still_active")?
   "Sendeforsøket kan fremdeles være aktivt. Kontroller igjen etter minst fem minutter.":
   "Påminnelsen kunne ikke frigis. Kontroller tilbudsnummer, Resend-status og begrunnelse."},{status:409});
 }
 if(body.action==="confirm_sent"){
  const state=await s.from("quote_followup_dispatches")
   .select("idempotency_key").eq("quote_id",id).single();
  if(state.error||!state.data)
   return NextResponse.json({error:"Resend-status ble registrert, men sluttføring må gjøres separat. Ingen e-post er sendt på nytt.",reviewRequired:true},{status:503});
  const completed=await s.rpc("complete_quote_followup",{p_quote_id:id,p_key:state.data.idempotency_key});
  if(completed.error)
   return NextResponse.json({error:"Bekreftet hos Resend, men endelig lagring feilet. Bruk Fullfør registrering uten ny e-post.",reviewRequired:true},{status:503});
  return NextResponse.json({ok:true,state:"sent",sentAt:completed.data?.sentAt});
 }
 return NextResponse.json({ok:true,state:"released",message:"Kontrollen er registrert. Neste automatiske kjøring kan gjøre ett nytt sendeforsøk hvis tilbudet fortsatt er gyldig."});
}
