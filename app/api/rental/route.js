import {rentalOverlapOr,extendOverdueAvailability} from "../../../lib/rentalOverdue.mjs";
import {osloDateKey} from "../../../lib/osloTime";
import {NextResponse} from "next/server";
import {calculateRentalPrice} from "../../../lib/rentalPricing.mjs";
import {db,fromDbRentalItem} from "../../../lib/supabase";
import {withSupabaseRetry} from "../../../lib/supabaseRetry";
import {peakRentalBookings,countedRentalBookings} from "../../../lib/rentalAvailability";

function valid(a,b){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(a||"")||!/^\d{4}-\d{2}-\d{2}$/.test(b||"")||b<a)return false;
 const A=new Date(a+"T12:00:00Z"),B=new Date(b+"T12:00:00Z");
 return !Number.isNaN(A.valueOf())&&!Number.isNaN(B.valueOf())&&A.toISOString().slice(0,10)===a&&B.toISOString().slice(0,10)===b;
}
function daysBetween(a,b){
 return Math.round((new Date(b+"T12:00:00Z")-new Date(a+"T12:00:00Z"))/86400000)+1;
}
function categoryMap(rows){
 return new Map((rows||[]).map(row=>[row.id,{
  id:row.id,
  name:row.name,
  slug:row.slug,
  description:row.description||"",
  sortOrder:Number(row.sort_order)||0,
  active:row.active!==false
 }]));
}

export async function GET(req){
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 const q=new URL(req.url).searchParams;
 const start=q.get("start"),end=q.get("end");
 const itemId=String(q.get("itemId")||"").trim();
 const slug=String(q.get("slug")||"").trim();

 if((start||end)&&!valid(start,end))return NextResponse.json({error:"Ugyldig datoperiode."},{status:400});

 const makeItemQuery=()=>{
  let query=s.from("rental_items").select("*").eq("active",true).neq("status","hidden").order("sort_order");
  if(itemId)query=query.eq("id",itemId);
  if(slug)query=query.eq("slug",slug);
  return query;
 };

 const [itemsResult,categoriesResult]=await Promise.all([
  withSupabaseRetry(makeItemQuery),
  withSupabaseRetry(()=>s.from("rental_categories").select("*").eq("active",true).order("sort_order").order("created_at"))
 ]);

 if(itemsResult.error){
  if(itemsResult.error.code==="42P01")return NextResponse.json({items:[],categories:[],setupRequired:true});
  return NextResponse.json({error:"Utleie kunne ikke lastes."},{status:500});
 }

 const categorySetupRequired=Boolean(categoriesResult.error&&["42P01","42703"].includes(categoriesResult.error.code));
 if(categoriesResult.error&&!categorySetupRequired){
  console.error("RENTAL CATEGORIES ERROR",categoriesResult.error);
 }

 const categories=categoriesResult.error?[]:(categoriesResult.data||[]).map(row=>({
  id:row.id,
  name:row.name,
  slug:row.slug,
  description:row.description||"",
  sortOrder:Number(row.sort_order)||0,
  active:row.active!==false
 }));
 const categoriesById=categoryMap(categoriesResult.data||[]);
 const items=(itemsResult.data||[]).map(row=>{
  const category=categoriesById.get(row.category_id);
  return fromDbRentalItem({
   ...row,
   category_name:category?.name||"",
   category_slug:category?.slug||""
  });
 });

 if(!start)return NextResponse.json({items,categories,categorySetupRequired,bookingOpen:process.env.VERCEL_ENV==="production"&&process.env.RENTAL_PUBLIC_BOOKING_ENABLED==="true"},{headers:{"Cache-Control":"no-store"}});
 if(daysBetween(start,end)>365)return NextResponse.json({error:"Utleieperioden kan ikke være lengre enn 365 dager."},{status:400});

 const out=[];
 for(const item of items){
  const buffer=item.bufferDays||0;
  const bs=new Date(start+"T12:00:00Z"),be=new Date(end+"T12:00:00Z");
  bs.setUTCDate(bs.getUTCDate()-buffer);
  be.setUTCDate(be.getUTCDate()+buffer);
  const from=bs.toISOString().slice(0,10),to=be.toISOString().slice(0,10);

  const [{data:blocks,error:blockError},{data:bookings,error:bookingError}]=await Promise.all([
   s.from("rental_blocks").select("id").eq("rental_item_id",item.id).lte("start_date",to).gte("end_date",from),
   s.from("rental_bookings").select("id,start_date,end_date,status,payment_status,payment_reference,payment_due_at").eq("rental_item_id",item.id).in("status",["new","confirmed","active"]).lte("start_date",to).or(rentalOverlapOr(from,osloDateKey(new Date())))
  ]);
  if(blockError||bookingError){
   console.error("RENTAL AVAILABILITY ERROR",blockError||bookingError);
   return NextResponse.json({error:"Tilgjengelighet kunne ikke kontrolleres."},{status:500});
  }
  const manuallyBlocked=(blocks?.length||0)>0;
  const booked=peakRentalBookings(extendOverdueAvailability(countedRentalBookings(bookings),osloDateKey(new Date()),to),start,end,buffer);
  const pricing=calculateRentalPrice(item,start,end);
  out.push({
   ...item,
   available:!!pricing&&item.status==="available"&&!manuallyBlocked&&booked<Math.max(1,Number(item.quantity)||1),
   pricing
  });
 }

 return NextResponse.json({items:out,categories,categorySetupRequired});
}
