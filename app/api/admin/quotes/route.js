import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";

const STATUSES=["draft","sent","accepted","declined","expired","cancelled"];
const SETUP_CODES=["42P01","42883","42703"];

async function currentUser(){
 const user=await getAdminUser();
 if(!user)return null;
 if(user.role==="owner"||user.canUpdateOrders||user.canManageProducts)return user;
 return null;
}
function clean(value,max=4000){
 return String(value??"").trim().slice(0,max);
}
function mapQuote(q){
 return {
  id:q.id,
  quoteNumber:q.quote_number,
  status:q.status||"draft",
  title:q.title||"",
  customer:q.customer||{},
  lineItems:Array.isArray(q.line_items)?q.line_items:[],
  paymentPlan:Array.isArray(q.payment_plan)?q.payment_plan:[],
  subtotalExVatOre:Number(q.subtotal_ex_vat_ore)||0,
  vatOre:Number(q.vat_ore)||0,
  totalIncVatOre:Number(q.total_inc_vat_ore)||0,
  introText:q.intro_text||"",
  notes:q.notes||"",
  terms:q.terms||"",
  validUntil:q.valid_until||null,
  plannedStartDate:q.planned_start_date||null,
  autoFollowUp:q.auto_follow_up!==false,
  followUpSentAt:q.follow_up_sent_at||null,
  sourceOrderId:q.source_order_id||null,
  convertedOrderId:q.converted_order_id||null,
  sentAt:q.sent_at||null,
  acceptedAt:q.accepted_at||null,
  declinedAt:q.declined_at||null,
  archivedAt:q.archived_at||null,
  createdAt:q.created_at,
  updatedAt:q.updated_at
 };
}
function sanitizeCustomer(value){
 const c=value&&typeof value==="object"?value:{};
 return {
  name:clean(c.name,180),
  email:clean(c.email,240).toLowerCase(),
  phone:clean(c.phone,80),
  address:clean(c.address,500)
 };
}
function sanitizeLines(value){
 if(!Array.isArray(value))return [];
 return value.slice(0,120).map((line,index)=>{
  const quantity=Number(line.quantity);
  const unitPriceOre=Number(line.unitPriceOre);
  const vatRate=Number(line.vatRate);
  return {
   id:clean(line.id,100)||("line-"+index),
   type:["work","material","other"].includes(line.type)?line.type:"work",
   description:clean(line.description,1000),
   quantity:Number.isFinite(quantity)&&quantity>0&&quantity<=100000?quantity:0,
   unit:clean(line.unit,40)||"stk",
   unitPriceOre:Number.isFinite(unitPriceOre)&&unitPriceOre>=0&&unitPriceOre<=100000000?Math.round(unitPriceOre):0,
   vatRate:Number.isFinite(vatRate)&&vatRate>=0&&vatRate<=100?vatRate:25
  };
 }).filter(line=>line.description&&line.quantity>0);
}
function totals(lines){
 let subtotal=0,vat=0;
 for(const line of lines){
  const net=Math.round(line.quantity*line.unitPriceOre);
  subtotal+=net;
  vat+=Math.round(net*(line.vatRate/100));
 }
 return {
  subtotalExVatOre:subtotal,
  vatOre:vat,
  totalIncVatOre:subtotal+vat
 };
}
function sanitizePlan(value){
 const fallback=[
  {id:"deposit",label:"Forskudd",percent:25,trigger:"Ved aksept av tilbud"},
  {id:"halfway",label:"Halvført arbeid",percent:50,trigger:"Når omtrent halvparten av arbeidet er utført"},
  {id:"completion",label:"Ferdigstillelse",percent:25,trigger:"Ved ferdigstillelse"}
 ];
 if(!Array.isArray(value)||!value.length)return fallback;
 const plan=value.slice(0,8).map((row,index)=>({
  id:clean(row.id,80)||("payment-"+index),
  label:clean(row.label,160)||("Delbetaling "+(index+1)),
  percent:Number(row.percent),
  trigger:clean(row.trigger,500)
 }));
 if(plan.some(row=>!Number.isFinite(row.percent)||row.percent<0||row.percent>100))return null;
 const sum=plan.reduce((total,row)=>total+row.percent,0);
 if(Math.abs(sum-100)>0.01)return null;
 return plan;
}
function payload(body,user,existing){
 const customer=sanitizeCustomer(body.customer);
 if(!customer.name)return {error:"Kunden må ha navn."};
 const title=clean(body.title,240);
 if(!title)return {error:"Tilbudet må ha en tittel."};
 const lines=sanitizeLines(body.lineItems);
 if(!lines.length)return {error:"Legg inn minst én tilbudslinje."};
 const paymentPlan=sanitizePlan(body.paymentPlan);
 if(!paymentPlan)return {error:"Betalingsplanen må til sammen være 100 %."};
 const calc=totals(lines);
 const validUntil=body.validUntil&&/^\d{4}-\d{2}-\d{2}$/.test(String(body.validUntil))?String(body.validUntil):null;
 const plannedStartDate=body.plannedStartDate&&/^\d{4}-\d{2}-\d{2}$/.test(String(body.plannedStartDate))?String(body.plannedStartDate):null;
 const status=STATUSES.includes(body.status)?body.status:(existing?.status||"draft");
 return {
  record:{
   title,
   status,
   customer,
   line_items:lines,
   payment_plan:paymentPlan,
   subtotal_ex_vat_ore:calc.subtotalExVatOre,
   vat_ore:calc.vatOre,
   total_inc_vat_ore:calc.totalIncVatOre,
   intro_text:clean(body.introText,8000)||null,
   notes:clean(body.notes,8000)||null,
   terms:clean(body.terms,12000)||null,
   valid_until:validUntil,
   planned_start_date:plannedStartDate,
   auto_follow_up:body.autoFollowUp===undefined?(existing?.auto_follow_up!==false):Boolean(body.autoFollowUp),
   source_order_id:body.sourceOrderId||existing?.source_order_id||null,
   ...(existing?{}:{created_by:user.id})
  },
  calc
 };
}

export async function GET(req){
 const user=await currentUser();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const params=new URL(req.url).searchParams;
 const id=clean(params.get("id"),100);
 const archived=params.get("archived")==="1";
 let query=s.from("quotes").select("*");
 if(id)query=query.eq("id",id).maybeSingle();
 else query=(archived?query.not("archived_at","is",null):query.is("archived_at",null)).order("created_at",{ascending:false});
 const {data,error}=await query;
 if(error){
  if(SETUP_CODES.includes(error.code))return NextResponse.json({quotes:[],setupRequired:true});
  return NextResponse.json({error:"Tilbudene kunne ikke hentes."},{status:500});
 }
 if(id&&!data)return NextResponse.json({error:"Tilbudet ble ikke funnet."},{status:404});
 return id?NextResponse.json({quote:mapQuote(data)}):NextResponse.json({quotes:(data||[]).map(mapQuote)});
}

export async function POST(req){
 const user=await currentUser();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json();
 const prepared=payload(body,user,null);
 if(prepared.error)return NextResponse.json({error:prepared.error},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data:numberData,error:numberError}=await s.rpc("next_quote_number");
 if(numberError){
  if(SETUP_CODES.includes(numberError.code))return NextResponse.json({error:"Databaseoppdatering mangler for tilbudssystemet.",setupRequired:true},{status:503});
  return NextResponse.json({error:"Tilbudsnummer kunne ikke opprettes."},{status:500});
 }
 const {data,error}=await s.from("quotes").insert({
  quote_number:numberData,
  ...prepared.record
 }).select("*").single();
 if(error){
  if(SETUP_CODES.includes(error.code))return NextResponse.json({error:"Databaseoppdatering mangler for tilbudssystemet.",setupRequired:true},{status:503});
  return NextResponse.json({error:"Tilbudet kunne ikke lagres."},{status:500});
 }
 return NextResponse.json({quote:mapQuote(data)});
}

export async function PATCH(req){
 const user=await currentUser();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json();
 const id=clean(body.id,100);
 if(!id)return NextResponse.json({error:"Tilbud mangler."},{status:400});
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 if(body.action==="archive"||body.action==="restore"){
  const {error}=await s.from("quotes").update({
   archived_at:body.action==="archive"?new Date().toISOString():null,
   updated_at:new Date().toISOString()
  }).eq("id",id);
  if(error)return NextResponse.json({error:"Arkivstatus kunne ikke lagres."},{status:500});
  return NextResponse.json({ok:true});
 }

 const {data:existing,error:findError}=await s.from("quotes").select("*").eq("id",id).maybeSingle();
 if(findError||!existing)return NextResponse.json({error:"Tilbudet ble ikke funnet."},{status:404});
 const prepared=payload(body,user,existing);
 if(prepared.error)return NextResponse.json({error:prepared.error},{status:400});
 const now=new Date().toISOString();
 const status=prepared.record.status;
 const statusDates={
  ...(status==="sent"&&!existing.sent_at?{sent_at:now}:{}),
  ...(status==="accepted"&&!existing.accepted_at?{accepted_at:now}:{}),
  ...(status==="declined"&&!existing.declined_at?{declined_at:now}:{})
 };
 const {data,error}=await s.from("quotes").update({
  ...prepared.record,
  ...statusDates,
  updated_at:now
 }).eq("id",id).select("*").single();
 if(error)return NextResponse.json({error:"Tilbudet kunne ikke lagres."},{status:500});
 return NextResponse.json({quote:mapQuote(data)});
}
