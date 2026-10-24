import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {buildInvoiceActivityTimeline} from "../../../../../lib/invoiceActivityTimeline";

export const runtime="nodejs";
const allowed=u=>u&&(u.role==="owner"||u.canUpdateOrders||u.canManageProducts);
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const HISTORY_LIMIT=501;
export async function GET(req){
 if(!allowed(await getAdminUser()))return reply({error:"Ingen tilgang."},403);
 const invoiceId=new URL(req.url).searchParams.get("invoiceId");
 if(!uuid(invoiceId))return reply({error:"Velg en gyldig faktura."},400);
 const s=db();if(!s)return reply({error:"Databasen er utilgjengelig."},503);
 const found=await s.from("invoice_drafts")
  .select("id,status,invoice_number,issued_at,issued_date,sent_at")
  .eq("id",invoiceId).maybeSingle();
 if(found.error)return reply({error:"Fakturaen kunne ikke kontrolleres."},503);
 if(!found.data||found.data.status==="draft")return reply({error:"Velg en utstedt faktura."},404);
 const sources=[
  ["invoice_payments","id,amount_ore,paid_on,note,recorded_at,reversed_at,vipps_reference"],
  ["invoice_vipps_payments","id,created_at,refunded_ore,delivery_method,receipt_sent_at"],
  ["invoice_vipps_refund_notices","id,payment_id,refunded_delta_ore,created_at,sent_at"],
  ["invoice_credit_notes","id,credit_number,issued_at,credit_date,total_ore,reason,sent_at"],
  ["invoice_reminder_sends","id,kind,status,created_at,sent_at"]
 ];
 const responses=await Promise.all(sources.map(async([table,columns])=>{
  const r=await s.from(table).select(columns).eq("invoice_id",invoiceId).limit(HISTORY_LIMIT);
  return {table,data:r.data,error:r.error};
 }));
 if(responses.some(r=>r.error||!Array.isArray(r.data)||r.data.length>=HISTORY_LIMIT))
  return reply({error:"Hendelseshistorikken er ufullstendig. Prøv å oppdatere eller kontakt administrator."},503);
 const [payments,vipps,refundNotices,creditNotes,reminders]=responses.map(x=>x.data);
 const events=buildInvoiceActivityTimeline({
  invoice:found.data,payments,vipps,refundNotices,creditNotes,
  reminders:reminders.map(r=>({...r,hasPdf:r.status==="sent"}))
 });
 return reply({invoiceNumber:found.data.invoice_number,events});
}
