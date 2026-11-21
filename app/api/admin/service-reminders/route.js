import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../lib/auth";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {db} from "../../../../lib/supabase";

export const runtime="nodejs";
const uuid=value=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const respond=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const owner=async()=>{const user=await getAdminUser();return user?.role==="owner"?user:null;};

export async function GET(){
 if(!(await owner()))return respond({error:"Bare eieren kan kontrollere påminnelseslogg."},403);
 const s=db();if(!s)return respond({error:"Databasen er utilgjengelig."},503);
 const columns="id,order_id,kind,appointment_at,recipient_email,state,claimed_at,sent_at,resend_email_id,last_issue,reviewed_at,review_note";
 const [outstanding,recent]=await Promise.all([
  s.from("service_appointment_reminder_attempts").select(columns)
   .in("state",["claimed","needs_review"])
   .order("claimed_at",{ascending:true}).limit(100),
  s.from("service_appointment_reminder_attempts").select(columns)
   .order("claimed_at",{ascending:false}).limit(15)
 ]);
 if(outstanding.error||recent.error)
  return respond({error:"Påminnelsesloggen kunne ikke leses."},503);
 const merged=new Map();
 for(const row of [...(outstanding.data||[]),...(recent.data||[])])merged.set(row.id,row);
 return respond({attempts:[...merged.values()],needsReview:(outstanding.data||[]).length,
  outstandingLimitReached:(outstanding.data||[]).length>=100});
}

export async function PATCH(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await owner();if(!user)return respond({error:"Bare eieren kan avklare utsendinger."},403);
 const body=await req.json().catch(()=>({}));
 const id=String(body.id||""),outcome=String(body.outcome||"");
 const phrase=outcome==="sent"?"BEKREFTET I RESEND":outcome==="unsent"?"IKKE SENDT":null;
 if(!uuid(id)||!phrase||body.confirmation!==phrase)
  return respond({error:"Kontroller Resend først og bruk korrekt bekreftelsestekst."},400);
 const note=String(body.note||"").trim();
 if(note.length<12||note.length>1200)
  return respond({error:"Skriv konkret hva du kontrollerte (12–1200 tegn)."},400);
 const resendId=String(body.resendId||"").trim();
 if(outcome==="sent"&&(resendId.length<8||resendId.length>240))
  return respond({error:"Registrer faktisk meldings-ID fra Resend."},400);
 const s=db();if(!s)return respond({error:"Databasen er utilgjengelig."},503);
 const {data,error}=await s.rpc("review_service_appointment_reminder",{
  p_attempt_id:id,p_reviewer_id:user.id,p_result:outcome,p_note:note,
  p_resend_email_id:outcome==="sent"?resendId:null
 });
 if(error){
  const isBusy=String(error.message||"").includes("reminder_still_in_progress");
  return respond({error:isBusy?
   "Utsendelsen kan fortsatt pågå. Vent minst fem minutter og sjekk Resend på nytt.":
   "Denne påminnelsen kan ikke avstemmes nå. Oppdater listen og kontroller leverandørloggen."},409);
 }
 return respond({ok:true,state:data?.state,
  message:outcome==="sent"?
   "Resend-ID er registrert. Dette er ikke bevis på levering til innboksen. Ingen ny e-post er sendt.":
   "Registrert som ikke sendt. Denne gamle påminnelsen blir ikke automatisk sendt på nytt; kontakt kunden manuelt ved behov."});
}
