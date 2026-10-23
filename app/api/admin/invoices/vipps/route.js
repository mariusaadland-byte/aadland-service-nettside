import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {vippsPublicPaymentsEnabled} from "../../../../../lib/vippsClient";
import {startInvoiceVipps,reconcileInvoiceVipps,invoiceVippsView} from "../../../../../lib/invoiceVipps";
import {refundInvoiceVipps} from "../../../../../lib/invoiceVippsRefund";
export const runtime="nodejs";
export const maxDuration=60;
const allowed=u=>u&&(u.role==="owner"||u.canUpdateOrders||u.canManageProducts);
const uuid=v=>typeof v==="string"&&/^[0-9a-f-]{36}$/i.test(v);
export async function GET(req){
 const user=await getAdminUser();
 if(!allowed(user))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const id=new URL(req.url).searchParams.get("id");if(!uuid(id))return NextResponse.json({error:"Velg en faktura."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Database utilgjengelig."},{status:503});
 const r=await s.from("invoice_vipps_payments").select("*").eq("invoice_id",id).order("created_at",{ascending:false}).limit(100);
 if(r.error)return NextResponse.json({error:"Vipps-status kunne ikke hentes."},{status:500});
 const attempts=r.data||[];
 const refundablePayments=user.role==="owner"?attempts.filter(p=>Number(p.captured_ore)>Number(p.refunded_ore)).map(invoiceVippsView):[];
 return NextResponse.json({payment:invoiceVippsView(attempts[0]),refundablePayments,refundAllowed:user.role==="owner",pushApproved:process.env.VIPPS_SERVICE_PUSH_ENABLED==="true"},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();
 if(!allowed(user))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const b=await req.json().catch(()=>({}));
 if(!uuid(b.id)||!["start","sync","refund"].includes(b.action))return NextResponse.json({error:"Ugyldig handling."},{status:400});
 if(b.action==="refund"&&user.role!=="owner")
  return NextResponse.json({error:"Bare eieren kan refundere en Vipps-faktura."},{status:403});
 if(b.action==="start"&&!vippsPublicPaymentsEnabled("service")&&user.role!=="owner")
  return NextResponse.json({error:"Bare eieren kan starte en kontrollert Vipps-pilot."},{status:403});
 const s=db();if(!s)return NextResponse.json({error:"Database utilgjengelig."},{status:503});
 const found=await s.from("invoice_drafts").select("*").eq("id",b.id).maybeSingle();
 if(found.error||!found.data)return NextResponse.json({error:"Fakturaen ble ikke funnet."},{status:404});
 try{
  let p;
  if(b.action==="start"){
   if(b.workCompleted!==true)return NextResponse.json({error:"Bekreft at arbeidet er ferdig før direkte betaling."},{status:400});
   p=await startInvoiceVipps(s,found.data,b.confirmedInvoice,{
    deliveryMethod:b.deliveryMethod,phone:b.phone,
    customerPresent:b.customerPresent===true,customerConsent:b.customerConsent===true
   });
  }else if(b.action==="refund"){
   p=await refundInvoiceVipps(s,found.data,{
    reference:b.reference,amountOre:b.amountOre,
    expectedCapturedOre:b.expectedCapturedOre,
    expectedRefundedOre:b.expectedRefundedOre,
    confirmedInvoiceNumber:b.confirmedInvoiceNumber
   });
  }else{
   const latest=await s.from("invoice_vipps_payments").select("reference").eq("invoice_id",b.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
   if(latest.error||!latest.data)throw Error("Ingen Vipps-betaling er startet.");
   p=await reconcileInvoiceVipps(s,latest.data.reference);
  }
  return NextResponse.json({ok:true,payment:invoiceVippsView(p)},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){console.error("INVOICE VIPPS",{id:b.id,message:e.message});return NextResponse.json({error:e.message||"Vipps-betalingen kunne ikke behandles. Prøv samme knapp igjen."},{status:409});}
}
