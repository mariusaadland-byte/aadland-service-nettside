import {NextResponse} from "next/server";
import {buildInvoiceDraftPdf} from "../../../../lib/invoiceDraftPdf";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// Publicly viewable sample only. Never reads a customer, issues an invoice,
// sends email, contacts Vipps or writes to the database.
export async function GET(req){
 const kind=new URL(req.url).searchParams.get("type")||"partial";
 if(!["partial","full"].includes(kind))return NextResponse.json({error:"Velg delbetaling eller full betaling."},{status:400});
 const full=kind==="full";
 const invoice={
  demoDocument:true,
  invoice_number:"DEMO-2026-0001",
  issued_date:"2026-10-23",
  due_date:"2026-11-06",
  title:"Montering og tilpasning - eksempel",
  customer:{
   name:"Eksempelkunde (TEST)",
   address:"Eksempelveien 12\n5000 Bergen",
   email:"eksempel@example.invalid",
   phone:"000 00 000",
   workDate:"2026-10-23",
   workAddress:"Eksempelveien 12, Bergen",
   workDescription:"Montering og tilpasning av innredning etter avtale.\nArbeidet inkluderer oppmaaling, montering og etterkontroll."
  },
  line_items:[
   {description:"Monteringsarbeid",quantity:8,unit:"time",unitPriceOre:10000,vatRate:25},
   {description:"Materialer og festemidler",quantity:1,unit:"stk",unitPriceOre:20000,vatRate:25}
  ],
  paid_ore:full?125000:50000,
  notes:"TESTDOKUMENT - ingen reell faktura, betaling eller refusjon er gjennomfort.",
  paymentReceipt:{
   amountOre:full?125000:50000,
   paidAt:"2026-10-23T00:00:00+02:00",
   reference:"DEMO-IKKE-EKTE-VIPPS-0001",
   outstandingOre:full?0:75000
  }
 };
 try{
  const bytes=await buildInvoiceDraftPdf(invoice);
  return new NextResponse(new Uint8Array(bytes),{
   headers:{
    "Content-Type":"application/pdf",
    "Content-Disposition":'inline; filename="TEST-Aadland-Service-'+(full?"Kvittering":"Delbetalingskvittering")+'.pdf"',
    "Cache-Control":"public, max-age=60",
    "X-Robots-Tag":"noindex, nofollow, noarchive",
    "X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"base-uri 'none'; frame-ancestors 'self'; object-src 'none'"
   }
  });
 }catch(error){
  console.error("INVOICE PDF DEMO ERROR",error?.message);
  return NextResponse.json({error:"Eksempelkvitteringen kunne ikke lages."},{status:500});
 }
}
