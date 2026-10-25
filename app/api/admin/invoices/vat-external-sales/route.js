import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {validateVatExternalSale} from "../../../../../lib/vatExternalSales";
export const runtime="nodejs";
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export async function POST(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan registrere eldre kundefakturaer."},403);
 if(process.env.VERCEL_ENV==="preview")return json({error:"Historiske fakturaer registreres bare fra produksjonssiden."},403);
 const body=await req.json().catch(()=>({}));
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 if(body.action==="void"){
  if(!uuid(body.id)||body.confirmed!==true||typeof body.reason!=="string"||
     body.reason.trim().length<8||body.reason.trim().length>500)
   return json({error:"Gi begrunnelse (minst 8 tegn) og bekreft oppheving."},400);
  const {data,error}=await s.from("vat_external_sales_documents")
   .update({voided_at:new Date().toISOString(),void_reason:body.reason.trim(),voided_by:user.id})
   .eq("id",body.id).is("voided_at",null).select("id").maybeSingle();
  if(error||!data)return json({error:"Fakturaen kunne ikke oppheves. Den er kanskje allerede opphevet."},409);
  return json({ok:true,id:data.id});
 }
 if(body.action!=="register")return json({error:"Ukjent fakturahandling."},400);
 let record;
 try{record=validateVatExternalSale(body)}catch(e){return json({error:e.message},400);}
 // Fail closed on numbers already used in the system's native invoices or credit notes.
 const [nativeInvoice,nativeCredit]=await Promise.all([
  s.from("invoice_drafts").select("id").eq("invoice_number",record.document_number).neq("status","draft").limit(1),
  s.from("invoice_credit_notes").select("id").eq("credit_number",record.document_number).limit(1)
 ]);
 if(nativeInvoice.error||nativeCredit.error)
  return json({error:"Fakturanummeret kunne ikke kontrolleres mot Aadland Service."},503);
 if(nativeInvoice.data?.length||nativeCredit.data?.length)
  return json({error:"Fakturanummeret finnes allerede i Aadland Service. Ikke importer det dobbelt."},409);
 const {data,error}=await s.from("vat_external_sales_documents")
  .insert({...record,confirmed_by:user.id})
  .select("id,document_number,document_date,kind,base_ore,vat_ore").single();
 if(error){
  return json({error:error.code==="23505"?
   "Denne fakturaen er allerede importert fra det oppgitte fakturasystemet.":
   "Fakturaen kunne ikke registreres."},error.code==="23505"?409:503);
 }
 return json({ok:true,document:data},201);
}
