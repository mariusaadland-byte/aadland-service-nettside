import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {buildReceiptPdf,receiptPdfFilename} from "../../../../lib/receiptPdf";

export const runtime="nodejs";
export async function POST(req){
 const originError=sameOriginGuard(req);if(originError)return originError;
 if(process.env.VERCEL_ENV!=="preview")return NextResponse.json({error:"Testkvittering er bare tilgjengelig i preview."},{status:404});
 return NextResponse.json({error:"S-31: Testmiljøet sender ikke e-post. Bruk syntetiske forhåndsvisninger uten utsending."},{status:403});
}
export async function GET(){
 if(process.env.VERCEL_ENV!=="preview")return NextResponse.json({error:"Testkvittering er bare tilgjengelig i preview."},{status:404});
 if(!await getAdminUser())return NextResponse.json({error:"Ikke innlogget."},{status:401});
 if(!await hasPermission("canUpdateOrders"))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 try{
  const orderNumber="TEST-2026-1001";
  const items=[
   {quantity:1,name:"Terrassebenk 160 cm",unitPriceOre:389000,details:[{label:"Overflate",value:"Oljet"}]},
   {quantity:2,name:"Plantekasse 120 cm",unitPriceOre:169000,details:[{label:"Utførelse",value:"Svartbeiset"}]},
   {quantity:1,name:"Oppbevaringskasse til terrasse",unitPriceOre:249000,details:[{label:"Størrelse",value:"Stor"}]}
  ];
  const shippingOre=79000;
  const totalOre=items.reduce((sum,item)=>sum+item.quantity*item.unitPriceOre,shippingOre);
  const pdf=await buildReceiptPdf({test:true,orderNumber,customerName:"Syntetisk testkunde",
   customerEmail:"test@example.invalid",customerPhone:"00000000",customerAddress:"Eksempeladresse",
   fulfillmentLabel:"Levering til kunde",reference:"TEST-VIPPS-12345",items,shippingOre,totalOre,
   paidAt:new Date(),orderNote:"Eksempel på leveringsmerknad.",quoteNumber:"TEST-TILBUD-1042",
   quoteNote:"Eksempel på tilbudsnotat.",vatRate:25});
  return new Response(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf",
   "Content-Disposition":'inline; filename="'+receiptPdfFilename(orderNumber)+'"',
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch{ return NextResponse.json({error:"PDF-forhåndsvisningen kunne ikke genereres."},{status:500}); }
}
