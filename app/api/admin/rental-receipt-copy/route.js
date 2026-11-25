import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {buildReceiptPdf,receiptPdfFilename} from "../../../../lib/receiptPdf";
import {rentalReplyTo} from "../../../../lib/rentalEmailConfig";
import {rentalAccountingReview} from "../../../../lib/rentalAccountingReview.mjs";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store, max-age=0","Vary":"Cookie"};
const json=(body,status)=>NextResponse.json(body,{status,headers});
export async function GET(req){
 const user=await getAdminUser();
 if(!user||(user.role!=="owner"&&!await hasPermission("canViewOrders")))return json({error:"Ingen tilgang."},403);
 const id=new URL(req.url).searchParams.get("bookingId")||"";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return json({error:"Ugyldig booking."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 const {data:b,error}=await s.from("rental_bookings").select("*,rental_items(name)").eq("id",id).maybeSingle();
 if(error)return json({error:"Booking kunne ikke hentes."},503);
 if(!b)return json({error:"Booking finnes ikke."},404);
 const review=rentalAccountingReview(b);
 if(!review.valid||!review.receiptEligible)return json({error:review.reason},409);
 try{
  const date=v=>String(v||"").split("-").reverse().join(".");
  const pdf=await buildReceiptPdf({
   orderNumber:b.booking_number,customerName:b.customer?.name||"Kunde",customerEmail:b.customer?.email||"",customerPhone:b.customer?.phone||"",customerAddress:b.customer?.address||"",
   fulfillmentLabel:b.customer?.fulfillment==="delivery"?"Levering":"Henting",reference:b.payment_reference,
   items:[{quantity:1,name:"Leie – "+(b.rental_items?.name||"Utleieutstyr"),unitPriceOre:review.agreedOre,details:[{label:"Periode",value:date(b.start_date)+" – "+date(b.end_date)}]}],
   totalOre:review.agreedOre,paidAt:b.payment_captured_at,vatRate:25,numberLabel:"Bookingnummer",itemsSectionLabel:"Leie",brandName:"Aadland Utleie",brandSiteUrl:"https://www.aadlandutleie.no",brandEmail:rentalReplyTo(),
   orderNote:"Regenerert betalingsbekreftelse (kopi). Ikke ny faktura eller bekreftelse på bankoppgjør. Depositum håndteres separat."
  });
  return new NextResponse(pdf,{headers:{...headers,"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="Kopi-'+receiptPdfFilename(b.booking_number)+'"',"X-Content-Type-Options":"nosniff"}});
 }catch{return json({error:"Kvitteringskopien kunne ikke opprettes."},500);}
}
