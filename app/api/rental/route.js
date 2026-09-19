import {NextResponse} from "next/server";
import {db,fromDbRentalItem} from "../../../lib/supabase";

function daysBetween(a,b){const start=new Date(a+"T12:00:00Z"),end=new Date(b+"T12:00:00Z");return Math.max(1,Math.round((end-start)/86400000)+1)}
function price(item,startDate,endDate){
 const days=daysBetween(startDate,endDate);
 let total=days*item.dailyPriceOre, basis="daily";
 if(item.weeklyPriceOre!=null && days>=7){const weeks=Math.floor(days/7),rest=days%7;total=weeks*item.weeklyPriceOre+rest*item.dailyPriceOre;basis="weekly"}
 if(item.weekendPriceOre!=null&&days<=3){const start=new Date(startDate+"T12:00:00Z"),end=new Date(endDate+"T12:00:00Z");const hasWeekend=[start.getUTCDay(),end.getUTCDay()].some(d=>d===0||d===5||d===6);if(hasWeekend&&item.weekendPriceOre<total){total=item.weekendPriceOre;basis="weekend"}}
 if(item.longTermDays&&days>=item.longTermDays&&item.longTermDiscountPercent>0){total=Math.round(total*(1-item.longTermDiscountPercent/100));basis+="+longterm"}
 return {days,totalOre:Math.max(0,total),depositOre:item.depositOre,basis};
}
export async function GET(req){
 const s=db();if(!s)return NextResponse.json({items:[]});
 const {searchParams}=new URL(req.url),start=searchParams.get("start"),end=searchParams.get("end");
 const {data,error}=await s.from("rental_items").select("*").eq("active",true).neq("status","hidden").order("sort_order");
 if(error)return NextResponse.json({items:[]});
 const items=(data||[]).map(fromDbRentalItem); if(!start||!end)return NextResponse.json({items});
 const out=[];
 for(const item of items){
  const buffer=item.bufferDays||0;
  const bs=new Date(start+"T12:00:00Z");bs.setUTCDate(bs.getUTCDate()-buffer);
  const be=new Date(end+"T12:00:00Z");be.setUTCDate(be.getUTCDate()+buffer);
  const from=bs.toISOString().slice(0,10),to=be.toISOString().slice(0,10);
  const [{data:blocks},{data:bookings}]=await Promise.all([
   s.from("rental_blocks").select("id").eq("rental_item_id",item.id).lte("start_date",to).gte("end_date",from),
   s.from("rental_bookings").select("id").eq("rental_item_id",item.id).in("status",["new","confirmed","active"]).lte("start_date",to).gte("end_date",from)
  ]);
  const used=(blocks?.length||0)+(bookings?.length||0);
  out.push({...item,available:item.status==="available"&&used<item.quantity,pricing:price(item,start,end)});
 }
 return NextResponse.json({items:out});
}
