import {NextResponse} from "next/server";
import {getCustomer} from "../../../../lib/customer-auth";
import {db} from "../../../../lib/supabase";
import {safeHttpsUrl} from "../../../../lib/safeUrl";

function mapQuote(quote){
 return {
  id:quote.id,
  quoteNumber:quote.quote_number,
  status:quote.status||"sent",
  title:quote.title||"Tilbud",
  totalIncVatOre:Number(quote.total_inc_vat_ore)||0,
  validUntil:quote.valid_until||null,
  plannedStartDate:quote.planned_start_date||null,
  revisionNumber:Number(quote.revision_number)||1,
  revisedFromId:quote.revised_from_id||null,
  supersededAt:quote.superseded_at||null,
  issuedVia:quote.issued_via||null,
  paperIssuedAt:quote.paper_issued_at||null,
  acceptanceMethod:quote.acceptance_method||null,
  paperSignedDate:quote.paper_signed_date||null,
  sentAt:quote.sent_at||null,
  acceptedAt:quote.accepted_at||null,
  declinedAt:quote.declined_at||null,
  createdAt:quote.created_at,
  href:"/tilbud/"+encodeURIComponent(quote.id)
 };
}

export async function GET(req){
 const customer=await getCustomer();
 if(!customer)return NextResponse.json({error:"Ikke innlogget."},{status:401});
 const s=db();
 if(!s)return NextResponse.json({error:"Kundekonto er ikke tilgjengelig akkurat nå."},{status:503});

 const customerEmail=String(customer.email||"").trim().toLowerCase();
 if(!customerEmail)return NextResponse.json({error:"Kundekontoen mangler e-postadresse. Kontakt oss for hjelp."},{status:403});
 const params=new URL(req?.url||"https://example.invalid/api/customer/me").searchParams;
 const kind=params.get("serviceHistory")||"";
 const page=Number(params.get("page")||"1");
 if(!["","orders","quotes","drawings"].includes(kind)||!Number.isSafeInteger(page)||page<1||page>100000||(!kind&&page!==1))return NextResponse.json({error:"Ugyldig historikkside."},{status:400});
 const wants=k=>!kind||kind===k;
 const empty={data:[],count:0,error:null};
 const range=(size)=>[(page-1)*size,page*size-1];
 const meta=(result,size)=>({page,total:Number.isInteger(result.count)?result.count:null,loadedThrough:(page-1)*size+(result.data||[]).length,hasMore:!result.error&&(Number.isInteger(result.count)?page*size<result.count:(result.data||[]).length===size)});
 if(!kind&&customerEmail){
  const [orderLink,rentalLink]=await Promise.all([
   s.from("orders").update({customer_user_id:customer.id})
    .is("customer_user_id",null)
    .contains("customer",{email:customerEmail}),
   process.env.VERCEL_ENV==="production"?s.from("rental_bookings").update({customer_user_id:customer.id})
    .is("customer_user_id",null)
    .contains("customer",{email:customerEmail}):Promise.resolve({error:null})
  ]);
  if(orderLink.error&&!["42703","42P01"].includes(String(orderLink.error.code||"")))console.error("CUSTOMER ORDER AUTO LINK",orderLink.error);
  if(rentalLink.error&&!["42703","42P01"].includes(String(rentalLink.error.code||"")))console.error("CUSTOMER RENTAL AUTO LINK",rentalLink.error);
 }

 const [ordersResult,rentalsResult,rentalPaymentResult,quotesResult]=await Promise.all([
  wants("orders")?s.from("orders")
   .select("id,order_number,order_type,status,total_ore,shipping_ore,payment_status,payment_provider,payment_reference,payment_psp_reference,payment_reserved_ore,payment_captured_ore,payment_authorized_at,payment_captured_at,payment_cancelled_at,payment_capture_guaranteed_until,vipps_checkout_started_at,payment_refunded_ore,payment_refunded_at,refund_last_ore,refund_reference,refund_note,refund_notice_sent_at,receipt_sent_at,confirmation_sent_at,confirmed_at,in_progress_at,confirmed_notice_sent_at,in_progress_notice_sent_at,fulfillment_type,delivery_within_radius,items,custom_request,survey_date,survey_confirmation_sent_at,survey_reminder_sent_at,created_at,job_start_at,job_customer_agreement,job_planning_updated_at,job_confirmation_sent_at,job_reminder_sent_at,ready_notice_sent_at,tracking_number,tracking_url,tracking_sent_at,delivery_notice_sent_at,dispatched_at,delivered_at,cancellation_reason,cancellation_sent_at,cancelled_at",{count:"exact"})
   .eq("customer_user_id",customer.id)
   .order("created_at",{ascending:false}).order("id",{ascending:false})
   .range(...range(100)):Promise.resolve(empty),
  !kind?s.from("rental_bookings")
   .select("id,booking_number,start_date,end_date,status,total_ore,deposit_ore,payment_status,deposit_status,customer,confirmation_sent_at,cancellation_sent_at,reminder_sent_at,created_at,rental_items(name,slug,active,status)")
   .eq("customer_user_id",customer.id)
   .order("created_at",{ascending:false})
   .limit(100):Promise.resolve(empty),
  !kind?s.from("rental_bookings")
   .select("id,payment_provider,payment_reference,payment_psp_reference,payment_reserved_ore,payment_captured_ore,payment_authorized_at,payment_captured_at,payment_cancelled_at,payment_capture_guaranteed_until,vipps_checkout_started_at,payment_due_at,payment_refunded_ore,payment_refunded_at,refund_last_ore,refund_reference,refund_note,refund_notice_sent_at,receipt_sent_at,deposit_held_ore,deposit_received_at,deposit_released_at,deposit_charged_ore")
   .eq("customer_user_id",customer.id)
   .order("created_at",{ascending:false})
   .limit(100):Promise.resolve(empty),
  wants("quotes")?s.from("quotes")
   .select("id,quote_number,status,title,total_inc_vat_ore,valid_until,planned_start_date,revision_number,revised_from_id,superseded_at,issued_via,paper_issued_at,acceptance_method,paper_signed_date,sent_at,accepted_at,declined_at,created_at,customer",{count:"exact"})
   .contains("customer",{email:customerEmail})
   .in("status",["sent","accepted","declined","expired","cancelled","superseded"])
   .order("created_at",{ascending:false}).order("id",{ascending:false})
   .range(...range(100)):Promise.resolve(empty)
 ]);

 if(ordersResult.error||rentalsResult.error||(kind==="quotes"&&quotesResult.error)){
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
   .in("converted_order_id",customOrderIds)
   .contains("customer",{email:customerEmail})
   .in("status",["sent","accepted","declined","expired","cancelled","superseded"]);

  if(!linkedQuoteError){
   for(const quote of linkedQuotes||[]){
    if(!quote.converted_order_id||String(quote.customer?.email||"").trim().toLowerCase()!==customerEmail)continue;
    let href=null;
    try{
     href="/tilbud/"+encodeURIComponent(quote.id);
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
  paymentDetailsAvailable:rentalPaymentById.has(row.id),
  rental_items:row.rental_items?{
   ...row.rental_items,
   slug:row.rental_items.active===false||row.rental_items.status==="hidden"?null:(row.rental_items.slug||null)
  }:null
 }));

 let drawings=[];
 const directResult=wants("drawings")?await s.from("project_drawings")
  .select("id,order_id,name,address,notes,drawing_data,updated_at",{count:"exact"})
  .eq("customer_user_id",customer.id)
  .eq("customer_visible",true)
  .order("updated_at",{ascending:false}).order("id",{ascending:false})
  .range(...range(50)):empty;
 const {data:drawingRows,error:drawingError}=directResult;
 if(drawingError){
  if(!["42P01","42703"].includes(String(drawingError.code||"")))console.error("CUSTOMER DRAWINGS",drawingError);
 }else{
  drawings=(drawingRows||[]).map(row=>({
   id:row.id,
   orderId:row.order_id||"",
   name:row.name||"Tegning",
   address:row.address||"",
   notes:row.notes||"",
   updatedAt:row.updated_at||null,
   drawingData:row.drawing_data&&typeof row.drawing_data==="object"?row.drawing_data:{}
  }));
 }

 // Include only immutable drawing versions actually shared with this email
 // through a sent offer. A newly registered Min side account sees the same
 // history, while unshared admin drawings remain completely private.
 let publicationResult=empty;
 if(wants("drawings")&&customerEmail){
  publicationResult=await s.from("quote_drawing_publications")
   .select("id,quote_id,drawing_id,name,address,notes,drawing_data,published_at",{count:"exact"})
   .eq("customer_email",customerEmail)
   .order("published_at",{ascending:false}).order("id",{ascending:false})
   .range(...range(150));
  const {data:published,error:publishedError}=publicationResult;
  if(publishedError){
   console.error("CUSTOMER PUBLISHED DRAWINGS",publishedError);
  }else{
   const seen=new Set(drawings.map(row=>row.id));
   for(const row of published||[]){
    const id=row.drawing_id||row.id;
    if(seen.has(id))continue;
    seen.add(id);
    drawings.push({
     id,
     orderId:"",
     name:row.name||"Tegning",
     address:row.address||"",
     notes:row.notes||"",
     updatedAt:row.published_at||null,
     drawingData:row.drawing_data&&typeof row.drawing_data==="object"?row.drawing_data:{},
     sharedWithQuoteId:row.quote_id,
     publishedCopy:true
    });
   }
  }
 }

 if(kind==="drawings"&&(directResult.error||publicationResult.error))return NextResponse.json({error:"Tegningshistorikken kunne ikke hentes."},{status:503});
 const direct=meta(directResult,50),published=meta(publicationResult,150);
 const serviceHistory={orders:meta(ordersResult,100),quotes:meta(quotesResult,100),drawings:{page,hasMore:direct.hasMore||published.hasMore,total:direct.total===null||published.total===null?null:direct.total+published.total,loadedThrough:Math.min(direct.total??Infinity,direct.loadedThrough)+Math.min(published.total??Infinity,published.loadedThrough)}};
 return NextResponse.json({
  customer,
  serviceHistory,
  orders,
  rentals,
  rentalHistoryLimited:rentals.length>=100,
  quotes,
  drawings,
  quoteSetupRequired
 },{headers:{"Cache-Control":"private, no-store, max-age=0","Vary":"Cookie"}});
}
