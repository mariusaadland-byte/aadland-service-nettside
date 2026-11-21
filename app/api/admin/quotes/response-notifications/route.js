import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {db} from "../../../../../lib/supabase";

export const runtime="nodejs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(value,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}});
const owner=async()=>{const u=await getAdminUser();return u?.role==="owner"?u:null};

export async function GET(req){
 if(!(await owner()))return json({error:"Bare eier kan se bekreftelseshistorikk."},403);
 const id=String(new URL(req.url).searchParams.get("id")||"");
 if(!UUID.test(id))return json({error:"Ugyldig tilbuds-ID."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 const [q,n]=await Promise.all([
  s.from("quotes").select("id,quote_number,status,accepted_at,declined_at").eq("id",id).maybeSingle(),
  s.from("quote_response_notifications")
   .select("id,recipient_kind,recipient_email,action,state,attempt_number,provider_email_id,claimed_at,sent_at,created_at,updated_at,last_issue")
   .eq("quote_id",id).order("created_at",{ascending:true})
 ]);
 if(q.error||n.error)return json({error:"Bekreftelseshistorikken kunne ikke leses."},503);
 if(!q.data)return json({error:"Tilbudet ble ikke funnet."},404);
 return json({quoteNumber:q.data.quote_number,quoteStatus:q.data.status,
  responseAt:q.data.accepted_at||q.data.declined_at||null,
  notifications:n.data||[],historicalNoLog:(!n.data?.length&&
   ["accepted","declined"].includes(q.data.status))});
}

export async function PATCH(req){
 const originError=sameOriginGuard(req);if(originError)return originError;
 const user=await owner();
 if(!user)return json({error:"Bare eier kan avklare uavklarte bekreftelser."},403);
 const body=await req.json().catch(()=>({}));
 const action=String(body.action||""),id=String(body.notificationId||"");
 if(!UUID.test(id)||!["confirm_sent","release_unsent"].includes(action))
  return json({error:"Ugyldig handling."},400);
 if(action==="confirm_sent"&&body.confirmation!=="BEKREFTET I RESEND"||
    action==="release_unsent"&&body.confirmation!=="IKKE SENDT")
  return json({error:"Du må kontrollere meldingen i Resend og bekrefte med riktig tekst."},400);
 const note=String(body.note||"").trim();
 if(note.length<12||note.length>1200)return json({error:"Skriv en konkret begrunnelse på 12–1200 tegn."},400);
 const providerId=String(body.providerEmailId||"").trim();
 if(action==="confirm_sent"&&(providerId.length<8||providerId.length>240))
  return json({error:"Registrer bekreftet meldings-ID fra Resend."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 const {data,error}=await s.rpc("review_customer_quote_response_notice",{
  p_notification_id:id,p_quote_number:String(body.quoteNumber||"").trim(),
  p_reviewer:user.id,p_action:action,p_note:note,
  p_provider_email_id:action==="confirm_sent"?providerId:null
 });
 if(error){
  const msg=String(error.message||"");
  return json({error:msg.includes("notice_attempt_may_be_active")?
   "Utsendelsen kan fortsatt pågå. Kontroller igjen når minst fem minutter har gått.":
   "Bekreftelsen kunne ikke avstemmes. Kontroller tilbudsnummer, Resend, sendestatus og begrunnelse."},409);
 }
 return json({ok:true,state:data?.state,
  message:action==="confirm_sent"?
   "Registrert som bekreftet hos Resend. Ingen ny e-post er sendt.":
   "Etter din kontroll er sendingen lagt i kø med ny idempotensnøkkel. Neste cron-kjøring kan sende den. Ingen e-post er sendt nå."});
}
