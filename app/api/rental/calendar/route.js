import {NextResponse} from "next/server";
import {db,fromDbRentalItem} from "../../../../lib/supabase";

function validMonth(value){
 return /^\d{4}-\d{2}$/.test(String(value||""));
}
function shiftDate(iso,days){
 const d=new Date(iso+"T12:00:00Z");
 d.setUTCDate(d.getUTCDate()+days);
 return d.toISOString().slice(0,10);
}
function monthBounds(month){
 const [year,monthNumber]=month.split("-").map(Number);
 const first=new Date(Date.UTC(year,monthNumber-1,1,12));
 const last=new Date(Date.UTC(year,monthNumber,0,12));
 return {
  start:first.toISOString().slice(0,10),
  end:last.toISOString().slice(0,10),
  days:last.getUTCDate()
 };
}
function eachDate(start,end){
 const out=[];
 let current=start;
 while(current<=end&&out.length<370){
  out.push(current);
  current=shiftDate(current,1);
 }
 return out;
}

export async function GET(req){
 const {searchParams}=new URL(req.url);
 const itemId=String(searchParams.get("itemId")||"").trim();
 const month=String(searchParams.get("month")||"").trim();

 if(!itemId||!validMonth(month)){
  return NextResponse.json({error:"Utstyr og måned må oppgis."},{status:400});
 }

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const {data:raw,error:itemError}=await s
  .from("rental_items")
  .select("*")
  .eq("id",itemId)
  .eq("active",true)
  .neq("status","hidden")
  .maybeSingle();

 if(itemError)return NextResponse.json({error:"Utstyret kunne ikke hentes."},{status:500});
 if(!raw)return NextResponse.json({error:"Utstyret ble ikke funnet."},{status:404});

 const item=fromDbRentalItem(raw);
 const bounds=monthBounds(month);
 const buffer=Math.max(0,Number(item.bufferDays)||0);
 const queryStart=shiftDate(bounds.start,-buffer);
 const queryEnd=shiftDate(bounds.end,buffer);

 const [{data:blocks,error:blockError},{data:bookings,error:bookingError}]=await Promise.all([
  s.from("rental_blocks")
   .select("start_date,end_date")
   .eq("rental_item_id",item.id)
   .lte("start_date",queryEnd)
   .gte("end_date",queryStart),
  s.from("rental_bookings")
   .select("start_date,end_date,status")
   .eq("rental_item_id",item.id)
   .in("status",["new","confirmed","active"])
   .lte("start_date",queryEnd)
   .gte("end_date",queryStart)
 ]);

 if(blockError||bookingError){
  console.error("RENTAL CALENDAR ERROR",blockError||bookingError);
  return NextResponse.json({error:"Tilgjengeligheten kunne ikke hentes."},{status:500});
 }

 const reservations=[
  ...(blocks||[]).map(entry=>({
   start:shiftDate(entry.start_date,-buffer),
   end:shiftDate(entry.end_date,buffer)
  })),
  ...(bookings||[]).map(entry=>({
   start:shiftDate(entry.start_date,-buffer),
   end:shiftDate(entry.end_date,buffer)
  }))
 ];

 const quantity=Math.max(1,Number(item.quantity)||1);
 const unavailableDates=eachDate(bounds.start,bounds.end).filter(date=>{
  if(item.status!=="available")return true;
  const used=reservations.filter(entry=>entry.start<=date&&entry.end>=date).length;
  return used>=quantity;
 });

 return NextResponse.json({
  itemId:item.id,
  month,
  unavailableDates,
  bufferDays:buffer,
  quantity
 });
}
