import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {buildInvoiceDraftPdf} from "../../../../../lib/invoiceDraftPdf";
import {osloDateKey} from "../../../../../lib/osloTime";
export const runtime="nodejs";
const fail=(error,status=400)=>NextResponse.json({error},{status});
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();if(!user||!(user.role==="owner"||user.canUpdateOrders||user.canManageProducts))return fail("Ingen tilgang.",403);
 if(process.env.VERCEL_ENV==="preview")return fail("Utsted fakturaer fra produksjonssiden.",403);
 const {id}=await req.json().catch(()=>({}));if(typeof id!=="string")return fail("Velg en faktura.");
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 const found=await s.from("invoice_drafts").select("*").eq("id",id).maybeSingle();
 if(found.error||!found.data)return fail("Fakturaen ble ikke funnet.",404);
 let invoice=found.data;
 if(invoice.status==="draft"&&invoice.planned_send_on&&invoice.planned_send_on>osloDateKey(new Date()))
  return fail("Fakturaen er planlagt til "+invoice.planned_send_on+" og kan ikke utstedes tidligere.",409);
 if(invoice.status==="draft"&&invoice.auto_send_state==="processing")
  return fail("Automatisk utsendelse er i gang. Vent til status er kontrollert.",409);
 if(invoice.status==="draft"&&invoice.automatic_send&&invoice.auto_send_state==="scheduled")
  return fail("Stopp automatisk utsendelse først dersom du vil fakturere manuelt.",409);
 if(invoice.status==="draft"){
  const issued=await s.rpc("issue_invoice_draft",{p_id:id,p_expected_updated_at:invoice.updated_at});
  if(issued.error)return fail(issued.error.message);
  invoice=issued.data;
 }
 try{
  if(!invoice.pdf_base64){
   const pdf=await buildInvoiceDraftPdf(invoice);
   const saved=await s.from("invoice_drafts").update({pdf_base64:pdf.toString("base64")}).eq("id",id).is("pdf_base64",null);
   if(saved.error)throw Error("Faktura-PDF kunne ikke lagres.");
  }
  return NextResponse.json({ok:true,invoiceNumber:invoice.invoice_number,printUrl:"/admin/faktura/utskrift/"+id});
 }catch(err){
  return fail("Faktura "+invoice.invoice_number+" er utstedt, men PDF-en kunne ikke klargjøres. Prøv samme knapp igjen.",500);
 }
}
