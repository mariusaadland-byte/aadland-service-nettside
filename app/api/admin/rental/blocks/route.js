import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {countedRentalBookings} from "../../../../../lib/rentalAvailability";
import {rentalOverlapOr} from "../../../../../lib/rentalOverdue.mjs";
import {osloDateKey} from "../../../../../lib/osloTime";
import {ownUseInput,ownUseMatches,ownUseReason} from "../../../../../lib/rentalOwnUse.mjs";

async function allowed(){
 return (await getAdminUser())&&(await hasPermission("canManageProducts"));
}
function validDate(value){
 const v=String(value||"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(v+"T12:00:00Z");
 return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;
}

export async function GET(req){
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const id=new URL(req.url).searchParams.get("itemId");
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 let q=s.from("rental_blocks").select("*").order("start_date");
 if(id)q=q.eq("rental_item_id",id);
 const {data,error}=await q;
 if(error){
  if(error.code==="42P01")return NextResponse.json({blocks:[],setupRequired:true});
  console.error("RENTAL BLOCKS GET",error);
  return NextResponse.json({error:"Blokkeringene kunne ikke hentes."},{status:500});
 }
 return NextResponse.json({blocks:(data||[]).map(x=>({
  id:x.id,
  itemId:x.rental_item_id,
  startDate:x.start_date,
  endDate:x.end_date,
  reason:x.reason||"",ownUse:ownUseReason(x.reason)!==null
 }))});
}

export async function POST(req){
 if(process.env.VERCEL_ENV!=="production")return NextResponse.json({error:"Utleieendringer er sperret utenfor produksjon."},{status:403,headers:{"Cache-Control":"no-store"}});
 const originError=sameOriginGuard(req); if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const b=await req.json().catch(()=>null);
 if(!b)return NextResponse.json({error:"Ugyldig forespørsel."},{status:400});
 const internal=b.kind==="own_use";
 const own=internal?ownUseInput(b,osloDateKey(new Date())):null;
 if(internal&&!own)return NextResponse.json({error:"Kontroller utstyr, dato og oppdragsreferanse."},{status:400});
 if(internal&&process.env.RENTAL_PUBLIC_BOOKING_ENABLED==="true")return NextResponse.json({error:"Egenreservasjon må ha atomisk kapasitetsvern før offentlig booking åpnes."},{status:409});
 if(!b.itemId||!validDate(b.startDate)||!validDate(b.endDate)||b.endDate<b.startDate){
  return NextResponse.json({error:"Velg gyldig fra- og til-dato."},{status:400});
 }
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 if(internal){
  const previous=await s.from("rental_blocks").select("*").eq("id",own.id).maybeSingle();
  if(previous.error)return NextResponse.json({error:"Reservasjonen kunne ikke kontrolleres."},{status:503});
  if(previous.data){if(!ownUseMatches(previous.data,own))return NextResponse.json({error:"Reservasjonsreferansen er i konflikt."},{status:409});return NextResponse.json({ok:true,reused:true});}
 }
 const {data:item,error:itemError}=await s.from("rental_items").select("id,buffer_days").eq("id",b.itemId).maybeSingle();
 if(itemError)return NextResponse.json({error:"Utstyret kunne ikke kontrolleres."},{status:500});
 if(!item)return NextResponse.json({error:"Utstyret ble ikke funnet."},{status:404});
 // Advisory precheck for current deployments; the staged database guard is
 // still required to make this check and insert atomic under concurrency.
 const buffer=Math.max(0,Number(item.buffer_days)||0);
 const from=new Date(b.startDate+"T12:00:00Z"),to=new Date(b.endDate+"T12:00:00Z");
 from.setUTCDate(from.getUTCDate()-buffer);to.setUTCDate(to.getUTCDate()+buffer);
 const {data:bookings,error:bookingError}=await s.from("rental_bookings")
  .select("status,payment_status,payment_reference,payment_due_at,end_date")
  .eq("rental_item_id",b.itemId).in("status",["new","confirmed","active"])
  .lte("start_date",to.toISOString().slice(0,10)).or(rentalOverlapOr(from.toISOString().slice(0,10),osloDateKey(new Date())));
 if(bookingError)return NextResponse.json({error:"Eksisterende bookinger kunne ikke kontrolleres."},{status:503});
 if(countedRentalBookings(bookings).length)return NextResponse.json({error:"Perioden overlapper en eksisterende booking eller bufferdag. Avklar bookingen før du blokkerer utstyret."},{status:409});
 if(internal){
  const other=await s.from("rental_blocks").select("id").eq("rental_item_id",own.rental_item_id).lte("start_date",to.toISOString().slice(0,10)).gte("end_date",from.toISOString().slice(0,10)).limit(1);
  if(other.error)return NextResponse.json({error:"Eksisterende sperrer kunne ikke kontrolleres."},{status:503});
  if(other.data?.length)return NextResponse.json({error:"Perioden overlapper en eksisterende blokkering. Kontroller kalenderen."},{status:409});
 }
 const {data,error}=await s.from("rental_blocks").insert(internal?own:{
  rental_item_id:b.itemId,
  start_date:b.startDate,
  end_date:b.endDate,
  reason:String(b.reason||"").trim().slice(0,1000)
 }).select("*").single();
 if(error){
  if(internal&&error.code==="23505"){const prior=await s.from("rental_blocks").select("*").eq("id",own.id).maybeSingle();if(!prior.error&&ownUseMatches(prior.data,own))return NextResponse.json({ok:true,reused:true});return NextResponse.json({error:"Reservasjonsreferansen er i konflikt."},{status:409});}
  if(/RENTAL_(UNAVAILABLE|CAPACITY_BUSY)/.test(String(error.message||""))||error.code==="40P01")return NextResponse.json({error:"Perioden ble nettopp opptatt. Oppdater kalenderen og prøv igjen."},{status:409});
  return NextResponse.json({error:"Blokkeringen kunne ikke opprettes."},{status:500});
 }
 return NextResponse.json({block:{
  id:data.id,
  itemId:data.rental_item_id,
  startDate:data.start_date,
  endDate:data.end_date,
  reason:data.reason||""
 }});
}

export async function DELETE(req){
 if(process.env.VERCEL_ENV!=="production")return NextResponse.json({error:"Utleieendringer er sperret utenfor produksjon."},{status:403,headers:{"Cache-Control":"no-store"}});
 const originError=sameOriginGuard(req); if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const {id}=await req.json();
 if(!id)return NextResponse.json({error:"Blokkering mangler."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {error}=await s.from("rental_blocks").delete().eq("id",id);
 if(error){console.error("RENTAL BLOCK DELETE",error);return NextResponse.json({error:"Blokkeringen kunne ikke slettes."},{status:500});}
 return NextResponse.json({ok:true});
}
