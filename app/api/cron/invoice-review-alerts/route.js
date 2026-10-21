import {NextResponse} from "next/server";
import {db} from "../../../../lib/supabase";
import {cronGuard} from "../../../../lib/cronAuth";
import {osloDateKey} from "../../../../lib/osloTime";
import {invoiceReviewAlerts,invoiceReviewEmail} from "../../../../lib/invoiceAdminAlerts";
export const runtime="nodejs";
export const maxDuration=60;
export async function GET(req){
 const denied=cronGuard(req);if(denied)return denied;
 if(process.env.VERCEL_ENV!=="production")return NextResponse.json({error:"Varsler sendes bare fra produksjon."},{status:403});
 const key=process.env.RESEND_API_KEY;if(!key)return NextResponse.json({error:"E-post er ikke konfigurert."},{status:503});
 const s=db();if(!s)return NextResponse.json({error:"Database utilgjengelig."},{status:503});
 const today=osloDateKey(new Date());
 try{
  const prior=await s.from("invoice_admin_alert_batches").select("*").eq("alert_day",today).maybeSingle();
  if(prior.error)throw Error("Varslingshistorikken kunne ikke hentes.");
  let batch=prior.data;
  if(batch?.status==="sent")return NextResponse.json({ok:true,alreadySent:true,sent:0});
  if(!batch){
   const invoices=[],notices=[];
   for(let offset=0;;offset+=500){
    const {data,error}=await s.from("invoice_drafts").select("id,invoice_number,status,customer,line_items,due_date,paid_ore").in("status",["issued","sent"]).order("id").range(offset,offset+499);
    if(error)throw Error("Fakturaene kunne ikke hentes.");invoices.push(...data);if(data.length<500)break;
   }
   if(!invoices.length)return NextResponse.json({ok:true,sent:0,needsReview:0});
   for(let offset=0;;offset+=500){
    const {data,error}=await s.from("invoice_reminder_sends").select("id,invoice_id,status,kind,due_date,sent_at,created_at").order("id").range(offset,offset+499);
    if(error)throw Error("Purringshistorikken kunne ikke hentes.");notices.push(...data);if(data.length<500)break;
   }
   const items=invoiceReviewAlerts(invoices,notices,today);
   if(!items.length)return NextResponse.json({ok:true,sent:0,needsReview:0});
   const email=invoiceReviewEmail(items,today);
   // One frozen digest per Oslo calendar day; simultaneous cron runs reuse it.
   const inserted=await s.from("invoice_admin_alert_batches").upsert({alert_day:today,recipient:"post@aadland-service.no",subject:email.subject,body:email.body,items},{onConflict:"alert_day",ignoreDuplicates:true});
   if(inserted.error)throw Error("Varslingen kunne ikke lagres.");
   const fresh=await s.from("invoice_admin_alert_batches").select("*").eq("alert_day",today).single();
   if(fresh.error||!fresh.data)throw Error("Varslingen kunne ikke hentes.");batch=fresh.data;
  }
  if(batch.status==="sent")return NextResponse.json({ok:true,alreadySent:true,sent:0});
  if(Date.now()-new Date(batch.created_at).getTime()>23*60*60*1000)return NextResponse.json({error:"Dagens tidligere sendeforsøk må kontrolleres i e-postloggen."},{status:409});
  const {Resend}=await import("resend");const resend=new Resend(key);
  let result;
  for(let attempt=0;attempt<3;attempt++){
   try{
    result=await resend.emails.send({from:"Aadland Service <noreply@aadland-service.no>",to:"post@aadland-service.no",subject:batch.subject,text:batch.body},{idempotencyKey:"invoice-admin-review/"+batch.id});
    if(result.error||!result.data?.id)throw Error("Sendingen kunne ikke bekreftes.");
    break;
   }catch{
    if(attempt===2){
     await s.from("invoice_admin_alert_batches").update({status:"failed",error_message:"E-postsendingen ble ikke bekreftet."}).eq("alert_day",today).neq("status","sent");
     throw Error("E-postsendingen ble ikke bekreftet. Samme utsending kan forsøkes igjen.");
    }
    await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
   }
  }
  const saved=await s.from("invoice_admin_alert_batches").update({status:"sent",sent_at:new Date().toISOString(),resend_id:result.data.id,error_message:null}).eq("alert_day",today);
  if(saved.error)throw Error("E-posten er sendt, men historikken kunne ikke oppdateres. Samme sending gjenbrukes ved nytt forsøk.");
  return NextResponse.json({ok:true,sent:1,needsReview:batch.items.length});
 }catch(error){return NextResponse.json({error:String(error?.message||"Varslingen kunne ikke gjennomføres.")},{status:500});}
}
