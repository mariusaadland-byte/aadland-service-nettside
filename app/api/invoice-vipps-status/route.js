import {NextResponse} from "next/server";
import {db} from "../../../lib/supabase";
import {rateLimitRequest} from "../../../lib/rateLimit";
import {sameOriginGuard} from "../../../lib/requestGuard";
import {invoiceVippsReference,reconcileInvoiceVipps} from "../../../lib/invoiceVipps";
export const runtime="nodejs";
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const limited=await rateLimitRequest(req,{scope:"invoice-vipps-status",max:20,windowSeconds:60});if(limited)return limited;
 const b=await req.json().catch(()=>({}));if(!invoiceVippsReference(b.reference))return NextResponse.json({error:"Ugyldig betalingsreferanse."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Status er utilgjengelig."},{status:503});
 try{
  const p=await reconcileInvoiceVipps(s,b.reference);
  // The opaque reference grants access only to minimal payment status, never customer data or documents.
  return NextResponse.json({status:p.state,receiptSent:Boolean(p.receipt_sent_at)},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Betalingen er ikke bekreftet ennå. Prøv igjen om litt."},{status:503});}
}
