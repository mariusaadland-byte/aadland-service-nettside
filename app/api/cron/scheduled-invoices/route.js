import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {cronGuard} from "../../../../lib/cronAuth";
import {osloDateKey} from "../../../../lib/osloTime";
import {POST as sendInvoice} from "../../admin/invoices/send/route";
import {scheduledInvoicePreflight} from "../../../../lib/scheduledInvoicePreflight";
import {sendScheduledInvoiceOwnerNotice} from "../../../../lib/scheduledInvoiceOwnerNotice";
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
 // A timed-out cron job cannot send its own failure notice. When we recover
 // its claim on the next run, notify the owner without attempting customer
 // delivery again. Notices share the original idempotency key with the
 // ordinary failure path, so a duplicate notification is not generated.
 const staleToReview=(expired.data||[]).filter(item=>item.final_state==="needs_review");
 const staleNotices=await Promise.allSettled(staleToReview.map(item=>
  sendScheduledInvoiceOwnerNotice({
   invoiceId:item.invoice_id,
   reason:"Et tidligere automatisk sendeforsøk ble avbrutt eller fikk ukjent resultat.",
   apiKey:process.env.RESEND_API_KEY
  })
 ));
 const failedNotices=staleNotices.filter(result=>result.status==="rejected").length;
 if(failedNotices)console.error("SCHEDULED INVOICE STALE REVIEW NOTICE FAILED",{count:failedNotices});
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
   const first=await s.from("invoice_drafts").select("id,status,sent_at,credited_ore")
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
    try{
     await sendScheduledInvoiceOwnerNotice({
      invoiceId:id,reason:error?.message,apiKey:process.env.RESEND_API_KEY
     });
    }catch{
     console.error("SCHEDULED INVOICE REVIEW NOTICE FAILED",{id});
    }
   }
   results.push({id,status:delivered?"sent":"needs_review"});
  }
 }
 return json({ok:true,date:today,processed:results.length,
  recoveredForReview:staleToReview.length,
  reviewNoticeFailures:failedNotices,
  results});
}
