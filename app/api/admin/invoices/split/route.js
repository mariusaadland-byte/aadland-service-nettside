import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {validInvoiceDay} from "../../../../../lib/invoiceInputVat";
export const runtime="nodejs";
const json=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export async function PATCH(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();if(user?.role!=="owner")
  return json({error:"Bare eieren kan stoppe autosending."},403);
 if(process.env.VERCEL_ENV!=="production")
  return json({error:"Planlagt fakturering endres bare i produksjon."},403);
 const body=await req.json().catch(()=>({}));
 if(!uuid(body.id)||!["cancel","review_manual","reschedule"].includes(body.action)||body.confirmed!==true)
  return json({error:"Bekreft hvilken planlagt faktura som skal endres."},400);
 if(body.action==="reschedule"){
  if(!validInvoiceDay(body.sendOn)||!Number.isInteger(body.termsDays)||
    body.termsDays<0||body.termsDays>365||typeof body.autoSend!=="boolean")
   return json({error:"Velg gyldig sendingsdato, betalingsfrist og sendingsmetode."},400);
  if(body.autoSend&&(!process.env.CRON_SECRET||!process.env.RESEND_API_KEY))
   return json({error:"Automatisk utsendelse er ikke konfigurert. Velg manuell utsendelse."},503);
 }
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 if(body.action==="reschedule"){
  const result=await s.rpc("reschedule_second_invoice_draft",{
   p_id:body.id,p_send_on:body.sendOn,
   p_terms_days:body.termsDays,p_auto_send:body.autoSend
  });
  if(result.error)return json({error:result.error.message||
   "Planlagt sendingsdato kunne ikke endres. Ingen faktura er sendt."},409);
  return json({ok:true,plan:result.data});
 }
 if(body.action==="review_manual"){
  const released=await s.rpc("review_scheduled_invoice_for_manual_send",{p_id:body.id});
  if(released.error)return json({error:released.error.message||
   "Manuell frigivelse ble avvist. Kontroller sendestatus og kunden."},409);
  return json({ok:true,id:body.id,customerUpdated:released.data?.customerUpdated===true});
 }
 const {data,error}=await s.from("invoice_drafts").update({
  automatic_send:false,auto_send_state:"cancelled",auto_send_error:null
 }).eq("id",body.id).eq("split_part",2).eq("status","draft")
  .eq("automatic_send",true).eq("auto_send_state","scheduled")
  .select("id").maybeSingle();
 if(error)return json({error:"Autosending kunne ikke stoppes. Kontroller status."},503);
 if(!data)return json({error:"Planen er allerede under behandling, sendt eller avbrutt. Oppdater status."},409);
 return json({ok:true,id:data.id});
}

export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan dele og planlegge fakturaer."},403);
 if(process.env.VERCEL_ENV==="preview")return json({error:"Ekte fakturakladder deles kun i produksjon."},403);
 const body=await req.json().catch(()=>({}));
 const id=body.invoiceId,percentage=Number(body.firstPercent);
 const firstDays=Number(body.firstTermsDays),secondDays=Number(body.secondTermsDays);
 if(body.confirmed!==true)return json({error:"Bekreft fakturadeling og planlagt utsendelse."},400);
 if(!uuid(id)||!Number.isInteger(percentage)||percentage<1||percentage>99)
  return json({error:"Velg en fakturakladd og prosentfordeling fra 1 til 99."},400);
 if(!Number.isInteger(firstDays)||!Number.isInteger(secondDays)||
  firstDays<0||firstDays>365||secondDays<0||secondDays>365)
  return json({error:"Betalingsfristen må være 0–365 hele dager."},400);
 if(!validInvoiceDay(body.firstSendOn)||!validInvoiceDay(body.secondSendOn)||
  body.secondSendOn<=body.firstSendOn)
  return json({error:"Velg to gyldige datoer. Del 2 må sendes senere enn del 1."},400);
 if(body.autoSendSecond!==true&&body.autoSendSecond!==false)
  return json({error:"Velg om del 2 skal sendes automatisk."},400);
 if(body.autoSendSecond&&!process.env.CRON_SECRET)
  return json({error:"Automatisk utsendelse er ikke konfigurert. Velg manuell utsendelse."},503);
 if(body.autoSendSecond&&!process.env.RESEND_API_KEY)
  return json({error:"E-postutsendelse er ikke konfigurert."},503);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 const result=await s.rpc("split_invoice_draft_in_two",{
  p_invoice_id:id,p_first_percent:percentage,p_first_on:body.firstSendOn,
  p_second_on:body.secondSendOn,p_first_days:firstDays,
  p_second_days:secondDays,p_auto_second:body.autoSendSecond
 });
 if(result.error)return json({error:result.error.message||"Fakturaen kunne ikke deles. Ingen faktura er sendt."},409);
 return json({ok:true,split:result.data});
}
