import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {rateLimitRequest} from "../../../../lib/rateLimit";
import {db,fromDbRentalItem} from "../../../../lib/supabase";
import {osloDateKey} from "../../../../lib/osloTime";
import {calculateRentalPrice} from "../../../../lib/rentalPricing.mjs";
import {rentalCartInput,rentalCartTotals} from "../../../../lib/rentalCart.mjs";
import {countedRentalBookings,peakRentalBookings} from "../../../../lib/rentalAvailability";
import {rentalOverlapOr,extendOverdueAvailability} from "../../../../lib/rentalOverdue.mjs";
export const runtime="nodejs";
const json=(b,status=200)=>NextResponse.json(b,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(req){
 if(process.env.VERCEL_ENV!=="production"||process.env.RENTAL_PUBLIC_BOOKING_ENABLED!=="true"||process.env.RENTAL_CART_ENABLED!=="true")return json({error:"Leiehandlekurven er ikke åpnet."},503);
 const origin=sameOriginGuard(req);if(origin)return origin;
 const limit=await rateLimitRequest(req,{scope:"rental-cart-quote",max:20,windowSeconds:900,message:"For mange priskontroller. Prøv igjen senere."});if(limit)return limit;
 const today=osloDateKey(new Date()),lines=rentalCartInput(await req.json().catch(()=>null),today);
 if(!lines)return json({error:"Kontroller utstyr, antall og datoer. Maks 10 ulike produkttyper."},400);
 const s=db();if(!s)return json({error:"Databasen er ikke tilgjengelig."},503);
 const {data,error}=await s.from("rental_items").select("*").in("id",lines.map(x=>x.itemId)).eq("active",true).neq("status","hidden");
 if(error)return json({error:"Utstyr kunne ikke kontrolleres."},503);
 const items=new Map((data||[]).map(x=>[x.id,fromDbRentalItem(x)]));
 try{
 const result=await Promise.all(lines.map(async line=>{
  const item=items.get(line.itemId),fail=reason=>({...line,name:item?.name||"Utilgjengelig utstyr",available:false,reason});
  if(!item||item.status!=="available"||!item.pickupAvailable)return fail("Utstyret er ikke tilgjengelig for henting.");
  const p=calculateRentalPrice(item,line.startDate,line.endDate);
  if(!p)return fail("Ugyldig pris.");
  const totalOre=p.totalOre*line.quantity,depositOre=p.depositOre*line.quantity;
  if(!Number.isSafeInteger(totalOre)||!Number.isSafeInteger(depositOre)||totalOre>2147483647||depositOre>2147483647)return fail("Beløpet overskrider grensen.");
  const buffer=Math.max(0,Number(item.bufferDays)||0),a=new Date(line.startDate+"T12:00:00Z"),b=new Date(line.endDate+"T12:00:00Z");
  a.setUTCDate(a.getUTCDate()-buffer);b.setUTCDate(b.getUTCDate()+buffer);
  const from=a.toISOString().slice(0,10),to=b.toISOString().slice(0,10);
  const [blocks,bookings]=await Promise.all([s.from("rental_blocks").select("id").eq("rental_item_id",item.id).lte("start_date",to).gte("end_date",from).limit(1),s.from("rental_bookings").select("id,start_date,end_date,status,payment_status,payment_reference,payment_due_at",{count:"exact"}).eq("rental_item_id",item.id).in("status",["new","confirmed","active"]).lte("start_date",to).or(rentalOverlapOr(from,today)).limit(1000)]);
  if(blocks.error||bookings.error||bookings.count!==bookings.data?.length)throw Error("Ufullstendig tilgjengelighet");
  const peak=peakRentalBookings(extendOverdueAvailability(countedRentalBookings(bookings.data),today,to),line.startDate,line.endDate,buffer);
  const free=blocks.data?.length?0:Math.max(0,Math.max(1,Number(item.quantity)||1)-peak);
  if(free<line.quantity)return fail("Ikke nok ledige eksemplarer i perioden.");
  return {...line,name:item.name,available:true,totalOre,depositOre,days:p.days};
 }));
 return json({lines:result,totals:rentalCartTotals(result),reserved:false,checkoutEnabled:false});
 }catch{return json({error:"Tilgjengeligheten kunne ikke kontrolleres fullstendig."},503);}
}
