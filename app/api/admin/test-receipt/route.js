import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {buildReceiptEmail} from "../../../../lib/receiptEmail";

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 if(process.env.VERCEL_ENV!=="preview")return NextResponse.json({error:"Testkvittering er bare tilgjengelig i preview."},{status:404});
 const currentUser=await getAdminUser();
 if(!currentUser)return NextResponse.json({error:"Ikke innlogget."},{status:401});
 if(!(await hasPermission("canUpdateOrders")))return NextResponse.json({error:"Du har ikke tilgang til å sende testkvittering."},{status:403});

 const body=await req.json().catch(()=>({}));
 const email=String(body.email||"").trim().toLowerCase();
 const customerName=String(body.customerName||"Testkunde").trim().slice(0,120)||"Testkunde";
 const reference=String(body.reference||"TEST-VIPPS-12345").trim().slice(0,120)||"TEST-VIPPS-12345";
 if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"Skriv inn en gyldig e-postadresse."},{status:400});

 const resendKey=process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY;
 if(!resendKey)return NextResponse.json({error:"Preview-e-post er ikke konfigurert."},{status:503});

 const orderNumber="TEST-1001";
 const items=[
  {quantity:1,name:"Eksempelprodukt",unitPriceOre:800000}
 ];
 const shippingOre=50000;
 const totalOre=850000;
 const html=buildReceiptEmail({
  test:true,
  orderNumber,
  customerName,
  reference,
  items,
  shippingOre,
  totalOre,
  paidAt:new Date()
 });

 try{
  const {Resend}=await import("resend");
  const resend=new Resend(resendKey);
  const from=process.env.ORDER_EMAIL_FROM||"Aadland Service <noreply@aadland-service.no>";
  const replyTo=process.env.ORDER_REPLY_TO||"post@aadland-service.no";
  const result=await resend.emails.send({
   from,to:email,replyTo,
   subject:"[TEST] Betalingsbekreftelse – "+orderNumber,
   html
  });
  if(result?.error)throw new Error(result.error.message||"E-postfeil");
  return NextResponse.json({ok:true,sentTo:email});
 }catch(error){
  console.error("TEST RECEIPT EMAIL ERROR",error);
  return NextResponse.json({error:"Testkvitteringen kunne ikke sendes."},{status:500});
 }
}
