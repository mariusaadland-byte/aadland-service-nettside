import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {buildInvoiceDraftPdf} from "../../../../../lib/invoiceDraftPdf";
import {invoiceDueDate} from "../../../../../lib/invoicePaymentTerms";
import {osloDateKey} from "../../../../../lib/osloTime";
export const runtime="nodejs";
export async function GET(req){
 const user=await getAdminUser();
 if(!user||!(user.role==="owner"||user.canUpdateOrders||user.canManageProducts))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const id=new URL(req.url).searchParams.get("id");
 if(!id)return NextResponse.json({error:"Velg en fakturakladd."},{status:400});
 let invoice;
 if(id==="example")invoice={id:"example",title:"Eksempel - montering og vedlikehold",customer:{name:"Ola Nordmann",address:"Eksempelveien 12, 5000 Bergen",workDescription:"Utført montering og tilpasning som avtalt med kunden.\nFakturaen omfatter 8 timer tømrerarbeid samt materialer og festemidler."},line_items:[{description:"Tømrerarbeid",quantity:8,unit:"time",unitPriceOre:65000,vatRate:25},{description:"Materialer og festemidler",quantity:1,unit:"stk",unitPriceOre:189000,vatRate:25}],due_date:"2026-11-03"};
 else{
  const s=db();if(!s)return NextResponse.json({error:"Database utilgjengelig."},{status:503});
  const {data,error}=await s.from("invoice_drafts").select("*").eq("id",id).maybeSingle();
  if(error||!data)return NextResponse.json({error:"Fakturakladden ble ikke funnet."},{status:404});
  invoice=data;
  if(invoice.status==="draft"&&invoice.due_date_mode!=="manual"){
   const terms=await s.rpc("invoice_customer_terms",{p_customer:invoice.customer});
   if(terms.error)return NextResponse.json({error:"Kundens betalingsfrist kunne ikke hentes."},{status:500});
   invoice={...invoice,due_date:invoiceDueDate(osloDateKey(new Date()),Number(terms.data.days))};
  }
 }
 try{const pdf=invoice.pdf_base64?Buffer.from(invoice.pdf_base64,"base64"):await buildInvoiceDraftPdf(invoice);return new NextResponse(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf","Content-Disposition":(new URL(req.url).searchParams.get("inline")==="1"?"inline":"attachment")+'; filename="Aadland-Service-'+(invoice.invoice_number||"FAKTURAKLADD")+'.pdf"',"Cache-Control":"no-store","X-Frame-Options":"SAMEORIGIN","Content-Security-Policy":"base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'"}});}
 catch{return NextResponse.json({error:"Kunne ikke lage PDF."},{status:500});}
}
