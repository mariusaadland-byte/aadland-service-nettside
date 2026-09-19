import {NextResponse} from "next/server";
import {db,fromDbRentalItem} from "../../../lib/supabase";
function num(){return "AS-U-"+Date.now().toString().slice(-7)}
function days(a,b){return Math.max(1,Math.round((new Date(b+"T12:00:00Z")-new Date(a+"T12:00:00Z"))/86400000)+1)}
function calculate(i,a,b){const d=days(a,b);let total=d*i.dailyPriceOre,basis="daily";if(i.weeklyPriceOre!=null&&d>=7){total=Math.floor(d/7)*i.weeklyPriceOre+(d%7)*i.dailyPriceOre;basis="weekly"}if(i.weekendPriceOre!=null&&d<=3){const x=new Date(a+"T12:00:00Z").getUTCDay(),y=new Date(b+"T12:00:00Z").getUTCDay();if([x,y].some(v=>v===0||v===5||v===6)&&i.weekendPriceOre<total){total=i.weekendPriceOre;basis="weekend"}}if(i.longTermDays&&d>=i.longTermDays&&i.longTermDiscountPercent>0){total=Math.round(total*(1-i.longTermDiscountPercent/100));basis+="+longterm"}return {days:d,totalOre:total,depositOre:i.depositOre,basis}}
export async function POST(req){
 try{const b=await req.json();if(!b.itemId||!b.startDate||!b.endDate||!b.customer?.name||!b.customer?.email||!b.customer?.phone)return NextResponse.json({error:"Fyll inn utstyr, dato, navn, e-post og telefon."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data:raw,error}=await s.from("rental_items").select("*").eq("id",b.itemId).single();if(error||!raw||raw.active===false||raw.status!=="available")return NextResponse.json({error:"Utstyret er ikke tilgjengelig."},{status:409});
 const item=fromDbRentalItem(raw),buffer=item.bufferDays||0,bs=new Date(b.startDate+"T12:00:00Z"),be=new Date(b.endDate+"T12:00:00Z");bs.setUTCDate(bs.getUTCDate()-buffer);be.setUTCDate(be.getUTCDate()+buffer);
 const from=bs.toISOString().slice(0,10),to=be.toISOString().slice(0,10);
 const [{data:blocks},{data:bookings}]=await Promise.all([s.from("rental_blocks").select("id").eq("rental_item_id",item.id).lte("start_date",to).gte("end_date",from),s.from("rental_bookings").select("id").eq("rental_item_id",item.id).in("status",["new","confirmed","active"]).lte("start_date",to).gte("end_date",from)]);
 if((blocks?.length||0)+(bookings?.length||0)>=item.quantity)return NextResponse.json({error:"Utstyret er allerede opptatt i denne perioden."},{status:409});
 const p=calculate(item,b.startDate,b.endDate),bookingNumber=num(),snapshot={dailyPriceOre:item.dailyPriceOre,weekendPriceOre:item.weekendPriceOre,weeklyPriceOre:item.weeklyPriceOre,longTermDays:item.longTermDays,longTermDiscountPercent:item.longTermDiscountPercent,basis:p.basis,days:p.days};
 const {error:insertError}=await s.from("rental_bookings").insert({booking_number:bookingNumber,rental_item_id:item.id,customer:b.customer,start_date:b.startDate,end_date:b.endDate,status:"new",price_snapshot:snapshot,total_ore:p.totalOre,deposit_ore:p.depositOre,terms_version:b.termsVersion||"2026-09",});
 if(insertError)throw insertError;return NextResponse.json({bookingNumber,totalOre:p.totalOre,depositOre:p.depositOre,message:"Forespørselen er mottatt."});
 }catch(e){console.error(e);return NextResponse.json({error:"Bookingen kunne ikke lagres."},{status:500})}
}
