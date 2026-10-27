import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {validInvoiceDay} from "../../../../../lib/invoiceInputVat";
import {scheduledInvoicePreflight} from "../../../../../lib/scheduledInvoicePreflight";
export const runtime="nodejs";
const json=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

// A read-only rehearsal for an owner's scheduled second invoice.
// No invoice number, PDF, email or database write is created here.
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan kontrollere planlagt fakturering."},403);
 if(process.env.VERCEL_ENV!=="production")
  return json({error:"Forhåndskontroll er bare tilgjengelig på produksjonssiden."},403);
 const id=new URL(req.url).searchParams.get("id");
 if(!uuid(id))return json({error:"Velg en gyldig del-faktura."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 const found=await s.from("invoice_drafts")
  .select("id,status,split_group_id,split_part,automatic_send,auto_send_state,planned_send_on,first_send_at,issued_at,invoice_number,sent_at,customer")
  .eq("id",id).maybeSingle();
 if(found.error)return json({error:"Forhåndskontrollen kunne ikke hente fakturaen."},503);
 if(!found.data)return json({error:"Fakturaen ble ikke funnet."},404);
 const invoice=found.data;
 const result=(ready,reason)=>json({ok:true,ready,reason,
  plannedSendOn:invoice.planned_send_on||null,
  note:"Kun forhåndskontroll med dagens lagrede data. Ekte utsendelse sjekkes på nytt på sendingsdagen. Ingen e-post er sendt."});
 if(invoice.status!=="draft"||invoice.split_part!==2||!invoice.split_group_id||
  !invoice.automatic_send||invoice.auto_send_state!=="scheduled")
  return result(false,"Denne fakturaen har ikke en aktiv, planlagt autosending.");
 if(invoice.first_send_at||invoice.sent_at||invoice.issued_at||invoice.invoice_number)
  return result(false,"Et utstedelses- eller sendeforsøk er registrert. Kontroller e-postloggen og fakturaarkivet.");
 if(!invoice.planned_send_on)
  return result(false,"Fakturaen mangler planlagt sendingsdato.");
 if(!process.env.CRON_SECRET||!process.env.RESEND_API_KEY)
  return result(false,"Planlagt utsendelse er ikke konfigurert. Kontroller oppsettet.");
 const first=await s.from("invoice_drafts").select("id,status,sent_at,credited_ore")
  .eq("id",invoice.split_group_id).maybeSingle();
 if(first.error)return json({error:"Faktura 1 kunne ikke kontrolleres."},503);
 let contact=null;
 const contactId=String(invoice.customer?.contactId||"").trim();
 if(contactId){
  const current=await s.from("admin_customer_contacts")
   .select("id,name,email,address,phone,customer_type,organization_number,contact_person")
   .eq("id",contactId).maybeSingle();
  if(current.error)return json({error:"Kundekortet kunne ikke kontrolleres."},503);
  contact=current.data;
 }
 // The actual cron changes 'scheduled' to 'processing' through an atomic claim.
 // Only simulate that state for a side-effect-free read of the same preflight rules.
 const check=scheduledInvoicePreflight({
  invoice:{...invoice,auto_send_state:"processing"},
  firstInvoice:first.data,contact,today:invoice.planned_send_on
 });
 return result(check.ok,check.reason);
}

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
