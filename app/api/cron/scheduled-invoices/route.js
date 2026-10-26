import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {cronGuard} from "../../../../lib/cronAuth";
import {osloDateKey} from "../../../../lib/osloTime";
import {POST as sendInvoice} from "../../admin/invoices/send/route";
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
 const claimed=await s.rpc("claim_scheduled_invoice_sends",{p_today:today,p_batch_size:5});
 if(claimed.error)return json({error:"Planlagte fakturaer kunne ikke kontrolleres."},503);
 const results=[];
 for(const row of claimed.data||[]){
  const id=row.invoice_id;
  if(typeof id!=="string")continue;
  try{
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
   results.push({id,status:delivered?"sent":"needs_review"});
  }
 }
 return json({ok:true,date:today,processed:results.length,results});
}
