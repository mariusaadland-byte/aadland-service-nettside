import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {cronGuard} from "../../../../lib/cronAuth";
import {osloDateKey} from "../../../../lib/osloTime";
import {POST as sendInvoice} from "../../admin/invoices/send/route";
import {scheduledInvoicePreflight} from "../../../../lib/scheduledInvoicePreflight";
export const runtime="nodejs";
export const maxDuration=60;
const json=(value,status=200)=>NextResponse.json(value,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(req){
 const blocked=cronGuard(req);if(blocked)return blocked;
 if(process.env.VERCEL_ENV!=="production")
  return json({error:"Planlagt utsendelse kjøres bare i produksjon."},403);
 if(!process.env.RESEND_API_KEY)return json({error:"E-post er ikke konfigurert."},503);
 const s=db();if(!s)return json({error:"Database utilgjengelig."},503);
 const today=osloDateKey(new Date());
 const expired=await s.rpc("expire_stale_scheduled_invoice_claims");
 if(expired.error)return json({error:"Forrige planlagte utsendelser kunne ikke avstemmes."},503);
 const claimed=await s.rpc("claim_scheduled_invoice_sends",{p_today:today,p_batch_size:5});
 if(claimed.error)return json({error:"Planlagte fakturaer kunne ikke kontrolleres."},503);
 const results=[];
 for(const row of claimed.data||[]){
  const id=row.invoice_id;
  if(typeof id!=="string")continue;
  try{
   // This check is intentionally after the atomic claim and before invoice issue.
   // A changed customer card, missing first installment or uncertain previous send
   // must stop delivery without generating any invoice number or PDF.
   const current=await s.from("invoice_drafts")
    .select("id,split_group_id,split_part,automatic_send,auto_send_state,planned_send_on,status,customer,first_send_at")
    .eq("id",id).maybeSingle();
   if(current.error||!current.data)throw Error("Fakturakladden kunne ikke kontrolleres.");
   const invoice=current.data;
   const first=await s.from("invoice_drafts").select("id,status,sent_at")
    .eq("id",invoice.split_group_id||id).maybeSingle();
   if(first.error)throw Error("Del 1 kunne ikke kontrolleres.");
   let contact=null;
   const contactId=String(invoice.customer?.contactId||"").trim();
   if(contactId){
    const customer=await s.from("admin_customer_contacts")
     .select("id,name,email,address,phone,customer_type,organization_number,contact_person")
     .eq("id",contactId).maybeSingle();
    if(customer.error)throw Error("Kundekortet kunne ikke kontrolleres.");
    contact=customer.data;
   }
   const check=scheduledInvoicePreflight({invoice,firstInvoice:first.data,contact,today});
   if(!check.ok)throw Error(check.reason);
   // Call the identical delivery path as the manual Send button: it assigns
   // the invoice number, freezes the PDF and reuses the Resend idempotency key.
   const internal=new Request(req.url,{
    method:"POST",
    headers:{"authorization":"Bearer "+process.env.CRON_SECRET,"content-type":"application/json"},
    body:JSON.stringify({id})
   });
   const response=await sendInvoice(internal);
   const answer=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(answer.error||"Utsendelsen ble ikke bekreftet.");
   const saved=await s.from("invoice_drafts").update({
    auto_send_state:"sent",auto_send_error:null
   }).eq("id",id).eq("auto_send_state","processing");
   if(saved.error)throw Error("Sendestatus er ikke bekreftet. Kontroller e-postloggen.");
   results.push({id,status:"sent"});
  }catch(error){
   // An unknown provider outcome MUST NOT trigger an automatic second attempt.
   // The owner can inspect Resend and retry the exact invoice manually.
   const record=await s.from("invoice_drafts").select("status,sent_at").eq("id",id).maybeSingle();
   const delivered=record.data?.status==="sent"||Boolean(record.data?.sent_at);
   await s.from("invoice_drafts").update({
    auto_send_state:delivered?"sent":"needs_review",
    auto_send_error:delivered?null:String(error?.message||"Utsendelsen er ikke bekreftet.").slice(0,250)
   }).eq("id",id).eq("auto_send_state","processing");
   console.error("SCHEDULED INVOICE NEEDS REVIEW",{id,delivered});
   if(!delivered){
    // Best-effort owner notification; unknown provider outcomes do not cause
    // another automatic attempt or change the invoice's recipient.
    try{
     const {Resend}=await import("resend");
     const resend=new Resend(process.env.RESEND_API_KEY);
     const note=await resend.emails.send({
      from:"Aadland Service <noreply@aadland-service.no>",
      to:"post@aadland-service.no",
      subject:"Kontroller planlagt del-faktura før sending",
      text:"Automatisk utsendelse av del-faktura 2 ble stoppet.\\n"+
       "Årsak: "+String(error?.message||"Ukjent feil").slice(0,250)+"\\n"+
       "Åpne fakturakladden: https://www.aadland-service.no/admin/faktura?id="+encodeURIComponent(id)+
       "\\nDet er ikke bekreftet at e-post ble sendt. Sjekk fakturaarkivet og e-postloggen før et nytt forsøk."
     },{idempotencyKey:"scheduled-invoice-review/"+id});
     if(note.error)console.error("SCHEDULED INVOICE REVIEW NOTICE FAILED",{id});
    }catch{
     console.error("SCHEDULED INVOICE REVIEW NOTICE FAILED",{id});
    }
   }
   results.push({id,status:delivered?"sent":"needs_review"});
  }
 }
 return json({ok:true,date:today,processed:results.length,
  recoveredForReview:(expired.data||[]).filter(item=>item.final_state==="needs_review").length,
  results});
}
