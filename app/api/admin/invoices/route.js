import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {sameOriginGuard} from "../../../../lib/requestGuard";

const allowed=user=>user&&(user.role==="owner"||user.canUpdateOrders||user.canManageProducts);
const fail=(error,status=400)=>NextResponse.json({error},{status});
const clean=(v,n=250)=>String(v??"").trim().slice(0,n);
const validLines=lines=>Array.isArray(lines)&&lines.length>0&&lines.length<=120&&lines.every(x=>clean(x.description)&&Number.isFinite(Number(x.quantity))&&Number(x.quantity)>=0&&Number(x.quantity)<=100000&&Number.isSafeInteger(Number(x.unitPriceOre))&&Number(x.unitPriceOre)>=0&&Number(x.unitPriceOre)<=100000000&&[0,12,15,25].includes(Number(x.vatRate)));
export async function GET(){
 const user=await getAdminUser();if(!allowed(user))return fail("Ingen tilgang.",403);
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 const {data,error}=await s.from("invoice_drafts").select("*").order("created_at",{ascending:false}).limit(150);
 return error?fail("Kunne ikke hente fakturakladder.",500):NextResponse.json({invoices:data});
}
export async function POST(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(!allowed(user))return fail("Ingen tilgang.",403);
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 const body=await req.json().catch(()=>null);if(!body||typeof body!=="object")return fail("Ugyldig data.");
 let draft;
 if(body.quoteId){
  const {data:q,error}=await s.from("quotes").select("id,status,title,customer,line_items,intro_text,quote_number").eq("id",body.quoteId).maybeSingle();
  if(error||!q)return fail("Tilbudet ble ikke funnet.",404);
  if(q.status!=="accepted")return fail("Bare godkjente tilbud kan gjøres om til fakturakladd.");
  const {data:existing}=await s.from("invoice_drafts").select("id").eq("source_quote_id",q.id).maybeSingle();
  if(existing)return NextResponse.json({id:existing.id,alreadyExists:true});
  const model=/^PRISFORM: TIMEARBEID/.test(q.intro_text||"")?"hourly":/^PRISFORM: PRISOVERSLAG/.test(q.intro_text||"")?"estimate":"fixed";
  draft={source_quote_id:q.id,title:clean(q.title),customer:q.customer||{},pricing_model:model,line_items:(q.line_items||[]).map(x=>({description:clean(x.description,500),type:x.type,quantity:Number(x.quantity)||0,unit:clean(x.unit,30),unitPriceOre:Number(x.unitPriceOre)||0,vatRate:Number(x.vatRate)===0?0:Number(x.vatRate)||25})),notes:"Basert på tilbud "+clean(q.quote_number,40)};
  if(model!=="fixed")draft.notes+=". Kontroller faktisk medgåtte timer og materialforbruk før utstedelse.";
 }else{
  draft={title:clean(body.title)||"Ny faktura",customer:{name:clean(body.customerName),email:clean(body.customerEmail),address:clean(body.customerAddress)},pricing_model:"fixed",line_items:[{description:"Arbeid",type:"work",quantity:1,unit:"stk",unitPriceOre:0,vatRate:25}]};
 }
 const {data,error}=await s.from("invoice_drafts").insert(draft).select("id").single();
 if(error)return fail(error.code==="23505"?"Fakturakladd finnes allerede.":"Kunne ikke opprette fakturakladd.",500);
 return NextResponse.json({id:data.id});
}
export async function PATCH(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(!allowed(user))return fail("Ingen tilgang.",403);
 const body=await req.json().catch(()=>null);if(!body||typeof body.id!=="string")return fail("Ugyldig faktura.");
 if(!validLines(body.lineItems))return fail("Kontroller fakturalinjer, antall og priser.");
 if(!["fixed","hourly","estimate"].includes(body.pricingModel))return fail("Ugyldig prismodell.");
 if(!clean(body.customer?.name))return fail("Kundenavn mangler.");
 const due=body.dueDate?clean(body.dueDate,10):null;
 if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return fail("Ugyldig forfallsdato.");
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 const update={title:clean(body.title),customer:{name:clean(body.customer.name),email:clean(body.customer.email),address:clean(body.customer.address,500),workDescription:clean(body.customer.workDescription,3000)},pricing_model:body.pricingModel,line_items:body.lineItems.map(x=>({description:clean(x.description,500),type:clean(x.type,20),quantity:Number(x.quantity),unit:clean(x.unit,30),unitPriceOre:Number(x.unitPriceOre),vatRate:Number(x.vatRate)})),notes:clean(body.notes,4000),due_date:due,updated_at:new Date().toISOString()};
 const {data,error}=await s.from("invoice_drafts").update(update).eq("id",body.id).eq("status","draft").select("id").maybeSingle();
 if(error||!data)return fail("Fakturakladden kunne ikke lagres.",500);
 return NextResponse.json({ok:true});
}
