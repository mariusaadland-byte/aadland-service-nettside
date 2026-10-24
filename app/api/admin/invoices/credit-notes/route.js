import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {freezeInvoiceCreditPdf} from "../../../../../lib/invoiceCreditNotes";
import {sendInvoiceCreditNote} from "../../../../../lib/invoiceCreditDelivery";
export const runtime="nodejs";
export const maxDuration=60;
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const fail=(error,status=400)=>NextResponse.json({error},{status,headers:{"Cache-Control":"private, no-store"}});
const owner=u=>u?.role==="owner";
const allowed=u=>u&&(owner(u)||u.canUpdateOrders||u.canManageProducts);
export async function GET(req){
 const user=await getAdminUser();if(!allowed(user))return fail("Ingen tilgang.",403);
 const url=new URL(req.url),id=url.searchParams.get("invoiceId");
 if(!uuid(id))return fail("Velg en faktura.");
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 const documentId=url.searchParams.get("documentId");
 if(documentId){
  if(!uuid(documentId))return fail("Ugyldig kreditnota.");
  const found=await s.from("invoice_credit_notes").select("*").eq("id",documentId).eq("invoice_id",id).maybeSingle();
  if(found.error||!found.data)return fail("Kreditnotaen finnes ikke.",404);
  try{
   const note=await freezeInvoiceCreditPdf(s,found.data);
   return new NextResponse(Buffer.from(note.pdf_base64,"base64"),{
    headers:{"Content-Type":"application/pdf",
     "Content-Disposition":'inline; filename="'+note.credit_number+'.pdf"',
     "Cache-Control":"private, no-store"}
   });
  }catch(e){return fail(e.message||"Kreditnota-PDF kunne ikke hentes.",503)}
 }
 const {data,error}=await s.from("invoice_credit_notes")
  .select("id,credit_number,credit_date,reason,lines,subtotal_ore,vat_ore,total_ore,issued_at,pdf_base64,sent_at,delivery_error")
  .eq("invoice_id",id).order("issued_at",{ascending:false}).limit(100);
 if(error)return fail("Kreditnotahistorikken kunne ikke hentes.",500);
 return NextResponse.json({canIssue:owner(user),creditNotes:(data||[]).map(({pdf_base64,...row})=>({...row,hasPdf:Boolean(pdf_base64)}))},
  {headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();if(!owner(user))return fail("Bare eieren kan utstede kreditnota.",403);
 if(process.env.VERCEL_ENV==="preview")return fail("Kreditnota må utstedes fra produksjonssiden.",403);
 const body=await req.json().catch(()=>({}));
 if(body.action==="send"){
  if(!uuid(body.invoiceId)||!uuid(body.documentId)||body.confirmed!==true)
   return fail("Bekreft hvilken kreditnota som skal sendes til kunden.");
  const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
  const {data,error}=await s.from("invoice_credit_notes").select("*")
   .eq("invoice_id",body.invoiceId).eq("id",body.documentId).maybeSingle();
  if(error||!data)return fail("Kreditnotaen ble ikke funnet.",404);
  try{
   const sent=await sendInvoiceCreditNote(s,data);
   return NextResponse.json({ok:true,...sent},{headers:{"Cache-Control":"private, no-store"}});
  }catch(e){return fail(e.message||"Kreditnotaen kunne ikke sendes.",502)}
 }
 if(!uuid(body.invoiceId)||!uuid(body.requestId)||!Array.isArray(body.lines)||
    !Number.isSafeInteger(body.expectedCreditedOre)||body.expectedCreditedOre<0||
    typeof body.reason!=="string")return fail("Kontroller kreditnotabeløp, årsak og faktura.");
 if(body.confirmed!==true)return fail("Bekreft at du vil utstede en ekte, nummerert kreditnota.");
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 const issued=await s.rpc("issue_invoice_credit_note",{
  p_invoice_id:body.invoiceId,p_request_id:body.requestId,
  p_reason:body.reason,p_lines:body.lines,
  p_expected_credited_ore:body.expectedCreditedOre,p_admin_id:user.id
 });
 if(issued.error)return fail(issued.error.message||"Kreditnotaen kunne ikke utstedes.",409);
 const note=issued.data;
 try{
  const frozen=await freezeInvoiceCreditPdf(s,note);
  return NextResponse.json({ok:true,creditNoteNumber:frozen.credit_number,id:frozen.id,hasPdf:true},
   {headers:{"Cache-Control":"private, no-store"}});
 }catch(e){
  return NextResponse.json({ok:true,creditNoteNumber:note.credit_number,id:note.id,hasPdf:false,
   warning:"Kreditnotaen er utstedt, men PDF-en er ennå ikke klar. Åpne kreditnotaen på nytt for å opprette den."},
   {headers:{"Cache-Control":"private, no-store"}});
 }
}
