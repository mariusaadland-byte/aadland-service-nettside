import {NextResponse} from "next/server";
import {getCustomer} from "../../../../lib/customer-auth";
import {db} from "../../../../lib/supabase";
import {createQuoteToken} from "../../../../lib/quoteLinks";
import {safeHttpsUrl} from "../../../../lib/safeUrl";

function mapQuote(quote){
 const token=createQuoteToken(quote);
 return {
  id:quote.id,
  quoteNumber:quote.quote_number,
  status:quote.status||"sent",
  title:quote.title||"Tilbud",
  totalIncVatOre:Number(quote.total_inc_vat_ore)||0,
  validUntil:quote.valid_until||null,
  plannedStartDate:quote.planned_start_date||null,
  sentAt:quote.sent_at||null,
  acceptedAt:quote.accepted_at||null,
  declinedAt:quote.declined_at||null,
  createdAt:quote.created_at,
  href:"/tilbud/"+encodeURIComponent(quote.id)+"?token="+encodeURIComponent(token)
 };
}

export async function GET(){
 const customer=await getCustomer();
 if(!customer)return NextResponse.json({error:"Ikke innlogget."},{status:401});
 const s=db();
 if(!s)return NextResponse.json({error:"Kundekonto er ikke tilgjengelig akkurat nå."},{status:503});

 const customerEmail=String(customer.email||"").trim().toLowerCase();
 if(customerEmail){
  const [orderLink,rentalLink]=await Promise.all([
   s.from("orders").update({customer_user_id:customer.id})
    .is("customer_user_id",null)
    .contains("customer",{email:customerEmail}),
   s.from("rental_bookings").update({customer_user_id:customer.id})
    .is("customer_user_id",null)
    .contains("customer",{email:customerEmail})
  ]);
  if(orderLink.error&&!["42703","42P01"].includes(String(orderLink.error.code||"")))console.error("CUSTOMER ORDER AUTO LINK",orderLink.error);
  if(rentalLink.error&&!["42703","42P01"].includes(String(rentalLink.error.code||"")))console.error("CUSTOMER RENTAL AUTO LINK",rentalLink.error);
 }

 const [ordersResult,rentalsResult,rentalPaymentResult,quotesResult]=await Promise.all([
  s.from("orders")
   .select("id,order_number,order_type,status,total_ore,shipping_ore,payment_status,payment_reference,payment_captured_ore,receipt_sent_at,fulfillment_type,items,custom_request,survey_date,survey_confirmation_sent_at,survey_reminder_sent_at,created_at,job_start_at,job_customer_agreement,job_planning_updated_at,job_confirmation_sent_at,job_reminder_sent_at,ready_notice_sent_at,tracking_number,tracking_url,tracking_sent_at,dispatched_at,delivered_at,cancellation_reason,cancellation_sent_at,cancelled_at")
   .eq("customer_user_id",customer.id)
   .order("created_at",{ascending:false})
   .limit(100),
  s.from("rental_bookings")
   .select("id,booking_number,start_date,end_date,status,total_ore,deposit_ore,payment_status,deposit_status,customer,confirmation_sent_at,cancellation_sent_at,reminder_sent_at,created_at,rental_items(name,slug,active)")
   .eq("customer_user_id",customer.id)
   .order("created_at",{ascending:false})
   .limit(100),
  s.from("rental_bookings")
   .select("id,payment_reference,payment_captured_ore,receipt_sent_at,deposit_held_ore,deposit_received_at,deposit_released_at,deposit_charged_ore")
   .eq("customer_user_id",customer.id)
   .order("created_at",{ascending:false})
   .limit(100),
  s.from("quotes")
   .select("id,quote_number,status,title,total_inc_vat_ore,valid_until,planned_start_date,sent_at,accepted_at,declined_at,created_at,customer")
   .contains("customer",{email:customerEmail})
   .in("status",["sent","accepted","declined","expired","cancelled"])
   .order("created_at",{ascending:false})
   .limit(100)
 ]);

 if(ordersResult.error||rentalsResult.error){
  return NextResponse.json({error:"Historikken kunne ikke hentes."},{status:500});
 }
 const rentalPaymentById=new Map();
 if(rentalPaymentResult.error){
  if(!["42703","42P01"].includes(String(rentalPaymentResult.error.code||"")))console.error("CUSTOMER RENTAL PAYMENT HISTORY",rentalPaymentResult.error);
 }else{
  for(const row of rentalPaymentResult.data||[])rentalPaymentById.set(row.id,row);
 }

 let quotes=[];
 let quoteSetupRequired=false;
 if(quotesResult.error){
  if(["42P01","42703"].includes(String(quotesResult.error.code||""))){
   quoteSetupRequired=true;
  }else{
   console.error("CUSTOMER QUOTE HISTORY",quotesResult.error);
  }
 }else{
  quotes=(quotesResult.data||[]).map(mapQuote);
 }

 const orderRows=ordersResult.data||[];
 const customOrderIds=orderRows.filter(order=>order.order_type==="custom").map(order=>order.id);
 const quoteByOrder=new Map();

 if(customOrderIds.length){
  const {data:linkedQuotes,error:linkedQuoteError}=await s.from("quotes")
   .select("id,quote_number,title,total_inc_vat_ore,payment_plan,planned_start_date,converted_order_id,customer")
   .in("converted_order_id",customOrderIds);

  if(!linkedQuoteError){
   for(const quote of linkedQuotes||[]){
    if(!quote.converted_order_id)continue;
    let href=null;
    try{
     const token=createQuoteToken(quote);
     href="/tilbud/"+encodeURIComponent(quote.id)+"?token="+encodeURIComponent(token);
    }catch(error){
     console.error("CUSTOMER ORDER QUOTE LINK",error);
    }
    quoteByOrder.set(quote.converted_order_id,{
     id:quote.id,
     quoteNumber:quote.quote_number,
     title:quote.title||"Oppdrag",
     totalIncVatOre:Number(quote.total_inc_vat_ore)||0,
     paymentPlan:Array.isArray(quote.payment_plan)?quote.payment_plan:[],
     earliestStartDate:quote.planned_start_date||null,
     href
    });
   }
  }else if(!["42P01","42703"].includes(String(linkedQuoteError.code||""))){
   console.error("CUSTOMER ORDER QUOTE HISTORY",linkedQuoteError);
  }
 }

 const productIds=[...new Set(orderRows.flatMap(order=>Array.isArray(order.items)?order.items.map(item=>String(item?.productId||"")).filter(Boolean):[]))];
 const productLinks=new Map();
 if(productIds.length){
  const {data:linkedProducts,error:linkedProductsError}=await s.from("products")
   .select("id,slug,active")
   .in("id",productIds);
  if(!linkedProductsError){
   for(const product of linkedProducts||[])productLinks.set(String(product.id),product.active===false?null:(product.slug||null));
  }else if(!["42P01","42703"].includes(String(linkedProductsError.code||""))){
   console.error("CUSTOMER PRODUCT LINKS",linkedProductsError);
  }
 }

 const orders=orderRows.map(order=>({
  ...order,
  tracking_url:safeHttpsUrl(order.tracking_url)||null,
  items:Array.isArray(order.items)?order.items.map(item=>({
   ...item,
   productSlug:productLinks.get(String(item?.productId||""))||null
  })):[],
  source_quote:quoteByOrder.get(order.id)||null
 }));

 const rentals=(rentalsResult.data||[]).map(row=>({
  ...row,
  ...(rentalPaymentById.get(row.id)||{}),
  rental_items:row.rental_items?{
   ...row.rental_items,
   slug:row.rental_items.active===false?null:(row.rental_items.slug||null)
  }:null
 }));

 return NextResponse.json({
  customer,
  orders,
  rentals,
  quotes,
  quoteSetupRequired
 });
}
