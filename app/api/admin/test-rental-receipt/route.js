import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {buildReceiptEmail} from "../../../../lib/receiptEmail";
import {buildReceiptPdf,receiptPdfFilename} from "../../../../lib/receiptPdf";

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 if(process.env.VERCEL_ENV!=="preview")return NextResponse.json({error:"Test av utleiekvittering er bare tilgjengelig i preview."},{status:404});
 const user=await getAdminUser();
 if(!user)return NextResponse.json({error:"Ikke innlogget."},{status:401});
 if(!(await hasPermission("canUpdateOrders")))return NextResponse.json({error:"Du har ikke tilgang til å sende testkvittering."},{status:403});

 const body=await req.json().catch(()=>({}));
 const email=String(body.email||"").trim().toLowerCase();
 const customerName=String(body.customerName||"Marius").trim().slice(0,120)||"Marius";
 const customerPhone=String(body.customerPhone||"999 99 999").trim().slice(0,40);
 const customerAddress=String(body.customerAddress||"Eksempelveien 12, 5000 Bergen").trim().slice(0,500);
 const reference=String(body.reference||"TEST-LEIE-VIPPS-2026").trim().slice(0,120)||"TEST-LEIE-VIPPS-2026";
 const depositReference=String(body.depositReference||"TEST-DEP-2026").trim().slice(0,120)||"TEST-DEP-2026";
 if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"Skriv inn en gyldig e-postadresse."},{status:400});

 const resendKey=process.env.RESEND_PREVIEW_API_KEY||process.env.RESEND_API_KEY;
 if(!resendKey)return NextResponse.json({error:"Preview-e-post er ikke konfigurert."},{status:503});

 const bookingNumber="TEST-U-2026-1001";
 const rentalOre=437500;
 const depositOre=250000;
 const receiptData={
  test:true,
  orderNumber:bookingNumber,
  customerName,
  customerEmail:email,
  customerPhone,
  customerAddress,
  fulfillmentLabel:"Henting",
  reference,
  items:[{
   quantity:1,
   name:"Leie – Tilhenger 750 kg",
   unitPriceOre:rentalOre,
   details:[
    {label:"Periode",value:"2. okt. 2026 – 5. okt. 2026"},
    {label:"Antall dager",value:"4"},
    {label:"Utlevering",value:"Henting"},
    {label:"Inkludert",value:"Lås og sikkerhetswire"}
   ]
  }],
  totalOre:rentalOre,
  paidAt:new Date(),
  vatRate:25,
  numberLabel:"Bookingnummer",
  itemsSectionLabel:"Leie",
  depositInfo:{
   amountOre:depositOre,
   statusLabel:"Holdes",
   reference:depositReference,
   note:"Depositumet holdes separat og er ikke inkludert i leiebeløpet eller totalsummen på denne kvitteringen."
  }
 };

 const html=buildReceiptEmail(receiptData);
 const pdf=await buildReceiptPdf(receiptData);

 try{
  const {Resend}=await import("resend");
  const resend=new Resend(resendKey);
  const from=process.env.ORDER_EMAIL_FROM||"Aadland Service <noreply@aadland-service.no>";
  const replyTo=process.env.ORDER_REPLY_TO||"post@aadland-service.no";
  const result=await resend.emails.send({
   from,to:email,replyTo,
   subject:"[TEST] Utleiekvittering – "+bookingNumber,
   html,
   attachments:[
    {
     filename:"aadland-service-logo.webp",
     path:"https://www.aadland-service.no/aadland-service-logo.webp",
     contentId:"aadland-service-logo"
    },
    {
     filename:receiptPdfFilename(bookingNumber),
     content:pdf.toString("base64")
    }
   ]
  });
  if(result?.error)throw new Error(result.error.message||"E-postfeil");
  return NextResponse.json({ok:true,sentTo:email});
 }catch(error){
  console.error("TEST RENTAL RECEIPT EMAIL ERROR",error);
  return NextResponse.json({error:"Testkvitteringen for utleie kunne ikke sendes."},{status:500});
 }
}
