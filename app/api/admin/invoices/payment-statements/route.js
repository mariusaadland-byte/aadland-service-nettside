import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {buildInvoicePaymentStatementPdf} from "../../../../../lib/invoicePaymentStatementPdf";
import {saveInvoicePaymentStatementPdf,sendInvoicePaymentStatement} from "../../../../../lib/invoicePaymentStatementDelivery";
export const runtime="nodejs";
export const maxDuration=60;
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const allowed=u=>u&&(u.role==="owner"||u.canUpdateOrders||u.canManageProducts);
const fail=(error,status=400)=>NextResponse.json({error},{status,headers:{"Cache-Control":"private, no-store"}});
const pdf=(buffer,invoiceNumber,date)=>{
 const sanitized=String(invoiceNumber||"faktura").replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,48);
 return new NextResponse(buffer,{headers:{"Content-Type":"application/pdf",
  "Content-Disposition":'inline; filename="Betalingsoversikt-'+sanitized+"-"+date+'.pdf"',
  "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
};
export async function GET(req){
 const user=await getAdminUser();if(!allowed(user))return fail("Ingen tilgang.",403);
 const url=new URL(req.url),invoiceId=url.searchParams.get("invoiceId");
 if(!uuid(invoiceId))return fail("Velg en utstedt faktura.");
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 const documentId=url.searchParams.get("documentId");
 if(documentId){
  if(!uuid(documentId))return fail("Ugyldig betalingsoversikt.");
  const found=await s.from("invoice_payment_statements").select("*")
   .eq("id",documentId).eq("invoice_id",invoiceId).maybeSingle();
  if(found.error||!found.data)return fail("Betalingsoversikten ble ikke funnet.",404);
  try{
   const {statement,pdfBase64}=await saveInvoicePaymentStatementPdf(s,found.data);
   return pdf(Buffer.from(pdfBase64,"base64"),statement.snapshot.invoiceNumber,statement.snapshot.asOfDate);
  }catch(e){return fail(e.message||"PDF-en kunne ikke åpnes.",503);}
 }
 if(url.searchParams.get("mode")==="history"){
  const result=await s.from("invoice_payment_statements")
   .select("id,created_at,sent_at,delivery_error,snapshot")
   .eq("invoice_id",invoiceId).order("created_at",{ascending:false}).limit(100);
  if(result.error)return fail("Historikken kunne ikke hentes.",503);
  return NextResponse.json({canSend:user.role==="owner",statements:(result.data||[]).map(({snapshot,...row})=>({
   ...row,asOfDate:snapshot?.asOfDate,paidOre:snapshot?.paidOre,
   outstandingOre:snapshot?.outstandingOre,creditedOre:snapshot?.creditedOre
  }))},{headers:{"Cache-Control":"private, no-store"}});
 }
 try{
  const result=await s.rpc("preview_invoice_payment_statement",{p_invoice_id:invoiceId});
  if(result.error||!result.data)throw Error(result.error?.message||"Betalingsoversikten kunne ikke hentes.");
  return pdf(await buildInvoicePaymentStatementPdf(result.data),
   result.data.invoiceNumber,result.data.asOfDate);
 }catch(e){return fail(e.message||"Oversikten kunne ikke vises.",409);}
}
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();if(user?.role!=="owner")
  return fail("Bare eieren kan sende en betalingsoversikt til kunden.",403);
 const body=await req.json().catch(()=>({}));
 if(!uuid(body.invoiceId)||body.action!=="send"||body.confirmed!==true||
  !Number.isSafeInteger(body.expectedPaidOre)||body.expectedPaidOre<0||
  !Number.isSafeInteger(body.expectedCreditedOre)||body.expectedCreditedOre<0||
  !Number.isSafeInteger(body.expectedOutstandingOre)||body.expectedOutstandingOre<0||
  typeof body.expectedEmail!=="string")
  return fail("Oppdater fakturaen og bekreft beløp og mottaker.");
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 try{
  const result=await sendInvoicePaymentStatement(s,body);
  return NextResponse.json({ok:true,...result},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return fail(e.message||"Betalingsoversikten kunne ikke sendes.",409);}
}
