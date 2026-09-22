import {NextResponse} from "next/server";
import {db,fromDbRentalItem} from "../../../lib/supabase";

function valid(a,b){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(a||"")||!/^\d{4}-\d{2}-\d{2}$/.test(b||"")||b<a)return false;
 const A=new Date(a+"T12:00:00Z"),B=new Date(b+"T12:00:00Z");
 return !Number.isNaN(A.valueOf())&&!Number.isNaN(B.valueOf())&&A.toISOString().slice(0,10)===a&&B.toISOString().slice(0,10)===b;
}
function daysBetween(a,b){
 return Math.round((new Date(b+"T12:00:00Z")-new Date(a+"T12:00:00Z"))/86400000)+1;
}
function price(item,startDate,endDate){
 const days=daysBetween(startDate,endDate);
 let total=days*item.dailyPriceOre,basis="daily";
 if(item.weeklyPriceOre!=null&&days>=7){
  total=Math.floor(days/7)*item.weeklyPriceOre+(days%7)*item.dailyPriceOre;
  basis="weekly";
 }
 if(item.weekendPriceOre!=null&&days<=3){
  const x=new Date(startDate+"T12:00:00Z").getUTCDay();
  const y=new Date(endDate+"T12:00:00Z").getUTCDay();
  if([x,y].some(d=>d===0||d===5||d===6)&&item.weekendPriceOre<total){
   total=item.weekendPriceOre;
   basis="weekend";
  }
 }
 if(item.longTermDays&&days>=item.longTermDays&&item.longTermDiscountPercent>0){
  total=Math.round(total*(1-item.longTermDiscountPercent/100));
  basis+="+longterm";
 }
 return {days,totalOre:Math.max(0,total),depositOre:item.depositOre,basis};
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

 let itemQuery=s.from("rental_items").select("*").eq("active",true).neq("status","hidden").order("sort_order");
 if(itemId)itemQuery=itemQuery.eq("id",itemId);
 if(slug)itemQuery=itemQuery.eq("slug",slug);

 const [itemsResult,categoriesResult]=await Promise.all([
  itemQuery,
  s.from("rental_categories").select("*").eq("active",true).order("sort_order").order("created_at")
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

 if(!start)return NextResponse.json({items,categories,categorySetupRequired});
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
   s.from("rental_bookings").select("id").eq("rental_item_id",item.id).in("status",["new","confirmed","active"]).lte("start_date",to).gte("end_date",from)
  ]);
  if(blockError||bookingError){
   console.error("RENTAL AVAILABILITY ERROR",blockError||bookingError);
   return NextResponse.json({error:"Tilgjengelighet kunne ikke kontrolleres."},{status:500});
  }
  const used=(blocks?.length||0)+(bookings?.length||0);
  out.push({...item,available:item.status==="available"&&used<Math.max(1,Number(item.quantity)||1),pricing:price(item,start,end)});
 }

 return NextResponse.json({items:out,categories,categorySetupRequired});
}
