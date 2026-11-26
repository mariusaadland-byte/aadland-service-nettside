import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {rateLimitRequest} from "../../../../../lib/rateLimit";
import {db} from "../../../../../lib/supabase";
import {osloDateKey,osloDateTimeLocal} from "../../../../../lib/osloTime";
import {appointmentSlotInput,appointmentAssignment,appointmentMatches} from "../../../../../lib/rentalAppointments.mjs";
import {rentalUnitId} from "../../../../../lib/rentalUnitQr.mjs";
export const runtime="nodejs";
const json=(b,status=200)=>NextResponse.json(b,{status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
const enabled=()=>process.env.VERCEL_ENV==="production"&&process.env.RENTAL_APPOINTMENTS_ENABLED==="true"&&process.env.RENTAL_PUBLIC_BOOKING_ENABLED!=="true";
const fields="id,slot_date,slot_time,kind,booking_id,assigned_kind";
export async function POST(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(!user||user.role!=="owner")return json({error:"Ingen tilgang."},403);
 if(!enabled())return json({error:"Tidsvinduer er ikke aktivert."},503);
 const limit=await rateLimitRequest(req,{scope:"rental-appointments",max:30,windowSeconds:900,message:"For mange forespørsler. Prøv igjen senere."});if(limit)return limit;
 const b=await req.json().catch(()=>null),s=db();if(!s)return json({error:"Database utilgjengelig."},503);
 if(b?.action==="create"){
  const slot=appointmentSlotInput(b,osloDateKey(new Date()));
  if(!slot||slot.slot_date+"T"+slot.slot_time.slice(0,5)<=osloDateTimeLocal(new Date())||!/^([01]\d|2[0-3]):(00|30):00$/.test(slot.slot_time))return json({error:"Velg et fremtidig halvtimesvindu."},400);
  const result=await s.from("rental_appointment_slots").insert(slot).select(fields).single();
  if(result.error?.code==="23505"){
   const prior=await s.from("rental_appointment_slots").select(fields).eq("id",slot.id).maybeSingle();
   if(!prior.error&&appointmentMatches(prior.data,slot))return json({ok:true,reused:true});
   return json({error:"Tidsvinduet er allerede registrert."},409);
  }
  if(result.error||!result.data)return json({error:"Tidsvinduet kunne ikke lagres."},503);
  return json({ok:true});
 }
 if(b?.action==="assign"){
  const a=appointmentAssignment(b);if(!a)return json({error:"Velg booking, tidsvindu og type."},400);
  const r=await s.rpc("assign_rental_appointment",{p_slot:a.slotId,p_booking:a.bookingId,p_kind:a.kind});
  if(r.error||!r.data)return json({error:"Kunne ikke tildele. Kontroller bookingdato, status og at tidsvinduet er ledig."},409);
  return json({ok:true});
 }
 if(b?.action==="remove"&&rentalUnitId(b.slotId)){
  const r=await s.from("rental_appointment_slots").delete().eq("id",b.slotId).is("booking_id",null).select("id").maybeSingle();
  if(r.error||!r.data)return json({error:"Bare ledige tidsvinduer kan fjernes."},409);
  return json({ok:true});
 }
 return json({error:"Ugyldig handling."},400);
}
