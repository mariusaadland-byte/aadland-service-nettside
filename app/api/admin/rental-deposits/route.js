import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {rateLimitRequest} from "../../../../lib/rateLimit";
import {db} from "../../../../lib/supabase";
import {validateRentalDepositInspection} from "../../../../lib/rentalDepositReview";

export const runtime="nodejs";
const allowed=async(permission)=>{
 const user=await getAdminUser();
 return user&&(user.role==="owner"||await hasPermission(permission))?user:null;
};
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(){
 const user=await allowed("canViewOrders");
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er utilgjengelig."},{status:503});
 const {data:bookings,error:bookingError}=await s.from("rental_bookings")
  .select("id,booking_number,customer,start_date,end_date,status,total_ore,deposit_ore,deposit_status,deposit_held_ore,deposit_charged_ore,deposit_reference,deposit_received_at,deposit_released_at,payment_status,rental_items(name)")
  .gt("deposit_ore",0).order("start_date",{ascending:true}).limit(300);
 if(bookingError){
  console.error("RENTAL DEPOSIT OVERVIEW",bookingError.message);
  return NextResponse.json({error:"Depositumoversikten kunne ikke hentes."},{status:500});
 }
 const ids=(bookings||[]).map(b=>b.id);
 let reviews=[];
 if(ids.length){
  const {data,error}=await s.from("rental_deposit_inspection_events")
   .select("id,booking_id,result,damage_estimate_ore,note,created_at")
   .in("booking_id",ids)
   .order("created_at",{ascending:false}).limit(500);
  if(error){
   console.error("RENTAL DEPOSIT INSPECTIONS",error.message);
   return NextResponse.json({error:"Returhistorikken kunne ikke hentes."},{status:500});
  }
  reviews=data||[];
 }
 const grouped=new Map();
 for(const review of reviews){
  const all=grouped.get(review.booking_id)||[];
  all.push({id:review.id,result:review.result,damageEstimateOre:review.damage_estimate_ore,note:review.note,createdAt:review.created_at});
  grouped.set(review.booking_id,all);
 }
 return NextResponse.json({
  canUpdate:user.role==="owner"||await hasPermission("canUpdateOrders"),
  bookings:(bookings||[]).map(b=>({
   id:b.id,bookingNumber:b.booking_number,
   itemName:b.rental_items?.name||"Utstyr",
   customerName:b.customer?.name||"Kunde",
   startDate:b.start_date,endDate:b.end_date,status:b.status,
   depositOre:b.deposit_ore,depositStatus:b.deposit_status||"not_paid",
   depositHeldOre:Number(b.deposit_held_ore)||0,
   depositChargedOre:Number(b.deposit_charged_ore)||0,
   depositReference:b.deposit_reference||"",
   depositReceivedAt:b.deposit_received_at,
   depositReleasedAt:b.deposit_released_at,
   paymentStatus:b.payment_status||"unpaid",
   inspections:grouped.get(b.id)||[]
  }))
 });
}
export async function POST(req){
 const origin=sameOriginGuard(req);
 if(origin)return origin;
 const user=await allowed("canUpdateOrders");
 if(!user)return NextResponse.json({error:"Ingen tilgang til å lagre returkontroller."},{status:403});
 const limited=await rateLimitRequest(req,{scope:"rental-inspection",max:30,windowSeconds:900,message:"For mange returkontroller på kort tid."});
 if(limited)return limited;
 const body=await req.json().catch(()=>({}));
 const bookingId=String(body.bookingId||"");
 const requestId=String(body.requestId||"");
 if(!idPattern.test(bookingId)||!idPattern.test(requestId))
  return NextResponse.json({error:"Ugyldig booking eller kontrollreferanse."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er utilgjengelig."},{status:503});
 const {data:existing,error:existingError}=await s.from("rental_deposit_inspection_events")
  .select("id,booking_id").eq("request_id",requestId).maybeSingle();
 if(existingError)return NextResponse.json({error:"Kunne ikke kontrollere tidligere registrering."},{status:500});
 if(existing){
  if(existing.booking_id!==bookingId)return NextResponse.json({error:"Kontrollreferansen er allerede brukt."},{status:409});
  return NextResponse.json({ok:true,reused:true,id:existing.id});
 }
 const {data:booking,error:bookingError}=await s.from("rental_bookings")
  .select("id,status,deposit_ore").eq("id",bookingId).maybeSingle();
 if(bookingError||!booking)return NextResponse.json({error:"Bookingen ble ikke funnet."},{status:404});
 const checked=validateRentalDepositInspection(booking,body);
 if(checked.error)return NextResponse.json({error:checked.error},{status:409});
 const {data:review,error}=await s.from("rental_deposit_inspection_events")
  .insert({
   booking_id:bookingId,
   request_id:requestId,
   result:checked.value.result,
   damage_estimate_ore:checked.value.damage_estimate_ore,
   note:checked.value.note,
   reviewed_by:user.id
  }).select("id").single();
 if(error){
  if(error.code==="23505")return NextResponse.json({ok:true,reused:true});
  console.error("RENTAL DEPOSIT INSPECTION INSERT",error.code);
  return NextResponse.json({error:"Returkontrollen kunne ikke lagres."},{status:500});
 }
 return NextResponse.json({ok:true,id:review.id});
}
