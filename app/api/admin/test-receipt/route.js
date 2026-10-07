import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {buildReceiptEmail} from "../../../../lib/receiptEmail";
import {buildReceiptPdf,receiptPdfFilename} from "../../../../lib/receiptPdf";
import {serviceEmailFrom,serviceReplyTo} from "../../../../lib/serviceEmailConfig";

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

 const orderNumber="TEST-2026-1001";
 const items=[
  {
   quantity:1,
   name:"Terrassebenk 160 cm",
   unitPriceOre:389000,
   details:[
    {label:"Lengde",value:"160 cm"},
    {label:"Overflate",value:"Oljet"},
    {label:"Treverk",value:"Trykkimpregnert"}
   ]
  },
  {
   quantity:2,
   name:"Plantekasse 120 cm",
   unitPriceOre:169000,
   details:[
    {label:"Mål",value:"120 × 40 × 45 cm"},
    {label:"Utførelse",value:"Svartbeiset"},
    {label:"Levering",value:"Ferdig montert"}
   ]
  },
  {
   quantity:1,
   name:"Oppbevaringskasse til terrasse",
   unitPriceOre:249000,
   details:[
    {label:"Størrelse",value:"Stor"},
    {label:"Farge",value:"Natur"}
   ]
  }
 ];
 const shippingOre=79000;
 const totalOre=1055000;
 const customerPhone=String(body.customerPhone||"999 99 999").trim().slice(0,40);
 const customerAddress=String(body.customerAddress||"Eksempelveien 12, 5000 Bergen").trim().slice(0,500);
 const orderNote=String(body.orderNote||"Ring ca. 30 minutter før levering. Plantekassene ønskes levert ferdig montert og settes ved inngangen.").trim().slice(0,2000);
 const quoteNote=String(body.quoteNote||"Avtalt oljet overflate på benken. Levering og plassering inngår i avtalt pris.").trim().slice(0,4000);
 const receiptData={
  test:true,
  orderNumber,
  customerName,
  customerEmail:email,
  customerPhone,
  customerAddress,
  fulfillmentLabel:"Levering til kunde",
  reference,
  items,
  shippingOre,
  totalOre,
  paidAt:new Date(),
  orderNote,
  quoteNumber:"TILBUD-1042",
  quoteNote,
  vatRate:25
 };
 const html=buildReceiptEmail(receiptData);
 const pdf=await buildReceiptPdf(receiptData);

 try{
  const {Resend}=await import("resend");
  const resend=new Resend(resendKey);
  const from=serviceEmailFrom();
  const replyTo=serviceReplyTo();
  const result=await resend.emails.send({
   from,to:email,replyTo,
   subject:"[TEST] Betalingsbekreftelse – "+orderNumber,
   html,
   attachments:[
    {
     filename:"aadland-service-logo.webp",
     path:"https://www.aadland-service.no/aadland-service-logo.webp",
     contentId:"aadland-service-logo"
    },
    {
     filename:receiptPdfFilename(orderNumber),
     content:pdf.toString("base64")
    }
   ]
  });
  if(result?.error)throw new Error(result.error.message||"E-postfeil");
  return NextResponse.json({ok:true,sentTo:email});
 }catch(error){
  console.error("TEST RECEIPT EMAIL ERROR",error);
  return NextResponse.json({error:"Testkvitteringen kunne ikke sendes."},{status:500});
 }
}
