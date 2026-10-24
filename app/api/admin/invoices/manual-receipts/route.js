import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {freezeManualInvoiceReceipt,sendManualInvoiceReceipt} from "../../../../../lib/invoiceManualReceipt";
export const runtime="nodejs";
export const maxDuration=60;
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const allowed=u=>u&&(u.role==="owner"||u.canUpdateOrders||u.canManageProducts);
const fail=(error,status=400)=>NextResponse.json({error},{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(req){
 if(!allowed(await getAdminUser()))return fail("Ingen tilgang.",403);
 const url=new URL(req.url),invoiceId=url.searchParams.get("invoiceId"),paymentId=url.searchParams.get("paymentId");
 if(!uuid(invoiceId)||!uuid(paymentId))return fail("Velg faktura og innbetaling.");
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 try{
  const receipt=await freezeManualInvoiceReceipt(s,invoiceId,paymentId);
  return new NextResponse(Buffer.from(receipt.pdfBase64,"base64"),{
   headers:{"Content-Type":"application/pdf",
    "Content-Disposition":'inline; filename="Kvittering-'+receipt.details.invoiceNumber+'-'+paymentId.slice(0,8)+'.pdf"',
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}
  });
 }catch(e){return fail(e.message||"Kvitteringen kunne ikke åpnes.",409)}
}
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();
 if(user?.role!=="owner")return fail("Bare eieren kan sende kvittering til kunden.",403);
 const body=await req.json().catch(()=>({}));
 if(!uuid(body.invoiceId)||!uuid(body.paymentId)||body.action!=="send"||body.confirmed!==true)
  return fail("Velg riktig innbetaling og bekreft e-postsending.");
 const s=db();if(!s)return fail("Databasen er utilgjengelig.",503);
 try{
  const result=await sendManualInvoiceReceipt(s,body.invoiceId,body.paymentId);
  return NextResponse.json({ok:true,...result},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return fail(e.message||"Kvitteringen kunne ikke sendes.",502)}
}
