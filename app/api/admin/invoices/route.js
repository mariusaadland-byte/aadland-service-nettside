import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {withInvoicePaymentTerms} from "../../../../lib/invoicePaymentTerms";
import {osloDateKey} from "../../../../lib/osloTime";
import {sameOriginGuard} from "../../../../lib/requestGuard";

const allowed=user=>user&&(user.role==="owner"||user.canUpdateOrders||user.canManageProducts);
const fail=(error,status=400)=>NextResponse.json({error},{status});
const clean=(v,n=250)=>String(v??"").trim().slice(0,n);
const validLines=lines=>Array.isArray(lines)&&lines.length>0&&lines.length<=120&&lines.every(x=>clean(x.description)&&Number.isFinite(Number(x.quantity))&&Number(x.quantity)>=0&&Number(x.quantity)<=100000&&Number.isSafeInteger(Number(x.unitPriceOre))&&Number(x.unitPriceOre)>=0&&Number(x.unitPriceOre)<=100000000&&[0,12,15,25].includes(Number(x.vatRate)));
export async function GET(){
 const user=await getAdminUser();if(!allowed(user))return fail("Ingen tilgang.",403);
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 const invoices=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await s.from("invoice_drafts").select("id,source_quote_id,customer,title,pricing_model,line_items,due_date,due_date_mode,notes,status,created_at,updated_at,installment_index,installment_label,installment_percent,installment_trigger,invoice_number,issued_date,issued_at,sent_at,resend_id,delivery_error,paid_ore,paid_date,payment_updated_at").order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+499);
  if(error)return fail("Kunne ikke hente fakturaer.",500);
  invoices.push(...data);
  if(data.length<500)break;
 }
 const contacts=[];
 if(invoices.some(x=>x.status==="draft")){
  for(let offset=0;;offset+=500){
   const {data,error}=await s.from("admin_customer_contacts").select("id,email,payment_terms_days").order("id").range(offset,offset+499);
   if(error)return fail("Kundenes betalingsfrister kunne ikke hentes.",500);
   contacts.push(...data);if(data.length<500)break;
  }
 }
 const today=osloDateKey(new Date());
 return NextResponse.json({invoices:invoices.map(x=>withInvoicePaymentTerms(x,contacts,today))});
}
export async function POST(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(!allowed(user))return fail("Ingen tilgang.",403);
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 const body=await req.json().catch(()=>null);if(!body||typeof body!=="object")return fail("Ugyldig data.");
 let draft;
 if(body.quoteId){
  const {data,error}=await s.rpc("ensure_quote_invoice_drafts",{quote_id:body.quoteId});
  if(error)return fail(error.message||"Kunne ikke hente betalingsplan.",400);
  const drafts=Array.isArray(data)?data:[];
  if(!drafts.length)return fail("Ingen fakturakladder ble opprettet.",500);
  return NextResponse.json({id:drafts[0].id,ids:drafts.map(x=>x.id),count:drafts.length});
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
 const mode=body.dueDateMode??"auto";if(!["auto","manual"].includes(mode))return fail("Ugyldig valg av betalingsfrist.");
 const due=body.dueDate?clean(body.dueDate,10):null;
 if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return fail("Ugyldig forfallsdato.");
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 const update={title:clean(body.title),customer:{name:clean(body.customer.name),email:clean(body.customer.email),address:clean(body.customer.address,500),phone:clean(body.customer.phone,70),contactId:clean(body.customer.contactId,36),workDescription:clean(body.customer.workDescription,3000),workDate:clean(body.customer.workDate,10),workAddress:clean(body.customer.workAddress,500)},pricing_model:body.pricingModel,line_items:body.lineItems.map(x=>({description:clean(x.description,500),type:clean(x.type,20),quantity:Number(x.quantity),unit:clean(x.unit,30),unitPriceOre:Number(x.unitPriceOre),vatRate:Number(x.vatRate)})),notes:clean(body.notes,4000),due_date:due,due_date_mode:mode,updated_at:new Date().toISOString()};
 const {data,error}=await s.from("invoice_drafts").update(update).eq("id",body.id).eq("status","draft").select("id").maybeSingle();
 if(error||!data)return fail("Fakturakladden kunne ikke lagres.",500);
 return NextResponse.json({ok:true});
}
