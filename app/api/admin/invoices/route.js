import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {withInvoicePaymentTerms} from "../../../../lib/invoicePaymentTerms";
import {summarizeInvoiceActivity} from "../../../../lib/invoiceSettlementInfo";
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
  const {data,error}=await s.from("invoice_drafts").select("id,source_quote_id,customer,title,pricing_model,line_items,due_date,due_date_mode,notes,status,created_at,updated_at,installment_index,installment_label,installment_percent,installment_trigger,invoice_number,issued_date,issued_at,sent_at,resend_id,delivery_error,paid_ore,credited_ore,paid_date,payment_updated_at").order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+499);
  if(error)return fail("Kunne ikke hente fakturaer.",500);
  invoices.push(...data);
  if(data.length<500)break;
 }
 // Read-only reconciliation: include confirmed Vipps captures/refunds and
 // signed credit note totals, without revealing raw provider references.
 const invoiceIds=invoices.filter(x=>x.status!=="draft").map(x=>x.id);
 const payments=[],credits=[];
 for(let start=0;start<invoiceIds.length;start+=100){
  const ids=invoiceIds.slice(start,start+100);
  for(const [table,columns,target] of [
   ["invoice_vipps_payments","id,invoice_id,state,captured_ore,refunded_ore",payments],
   ["invoice_credit_notes","id,invoice_id,total_ore,sent_at",credits]
  ]){
   for(let offset=0;;offset+=500){
    const result=await s.from(table).select(columns).in("invoice_id",ids)
     .order("id",{ascending:true}).range(offset,offset+499);
    if(result.error)return fail("Betalings- og kreditnotahistorikk kunne ikke hentes. Prøv å oppdatere.",503);
    target.push(...(result.data||[]));
    if((result.data||[]).length<500)break;
   }
  }
 }
 // Administrative closure is independent of the issued invoice and its ledger.
 // Fail closed when these records cannot be read; do not label unknown data as open.
 const closureRows=[];
 for(let start=0;start<invoiceIds.length;start+=100){
  const ids=invoiceIds.slice(start,start+100);
  for(let offset=0;;offset+=500){
   const found=await s.from("invoice_admin_closures")
    .select("invoice_id,closed_at,closed_by,close_note,last_changed_at,revision")
    .in("invoice_id",ids).order("invoice_id",{ascending:true}).range(offset,offset+499);
   if(found.error)return fail("Administrativ avslutningsstatus kunne ikke hentes.",503);
   closureRows.push(...(found.data||[]));
   if((found.data||[]).length<500)break;
  }
 }
 const closureMap=new Map(closureRows.map(c=>[c.invoice_id,{
  closedAt:c.closed_at,closeNote:c.close_note,lastChangedAt:c.last_changed_at,revision:c.revision
 }]));
 const invoicesWithActivity=summarizeInvoiceActivity(invoices,payments,credits)
  .map(x=>({...x,adminClosure:closureMap.get(x.id)||null}));
 const contacts=[];
 if(invoices.some(x=>x.status==="draft")){
  for(let offset=0;;offset+=500){
   const {data,error}=await s.from("admin_customer_contacts").select("id,email,payment_terms_days").order("id").range(offset,offset+499);
   if(error)return fail("Kundenes betalingsfrister kunne ikke hentes.",500);
   contacts.push(...data);if(data.length<500)break;
  }
 }
 const today=osloDateKey(new Date());
 return NextResponse.json({invoices:invoicesWithActivity.map(x=>withInvoicePaymentTerms(x,contacts,today))},{headers:{"Cache-Control":"private, no-store"}});
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
 // An unfinished draft may be saved before a customer is registered.
 // The issue/send paths still require a name and billing address.
 if(typeof body.expectedUpdatedAt!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(body.expectedUpdatedAt))return fail("Hent fakturakladden på nytt før lagring.",409);
 const mode=body.dueDateMode??"auto";if(!["auto","manual"].includes(mode))return fail("Ugyldig valg av betalingsfrist.");
 const due=body.dueDate?clean(body.dueDate,10):null;
 if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return fail("Ugyldig forfallsdato.");
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 let selected=null;
 const requestedId=clean(body.customer?.contactId,36);
 if(requestedId){
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(requestedId))return fail("Kundekortet er ugyldig.");
  const {data:contact,error:contactError}=await s.from("admin_customer_contacts")
   .select("id,name,email,phone,address,payment_terms_days,customer_type,organization_number,contact_person,preferred_payment_method").eq("id",requestedId).maybeSingle();
  if(contactError||!contact)return fail("Kundekortet finnes ikke. Velg kunden på nytt.",409);
  selected=contact;
 }
 const chosen=selected?{name:selected.name,email:selected.email||"",address:selected.address||"",phone:selected.phone||"",contactId:selected.id,paymentTermsDays:selected.payment_terms_days??14,customerType:selected.customer_type||"private",organizationNumber:selected.customer_type==="business"?(selected.organization_number||""):"",contactPerson:selected.customer_type==="business"?(selected.contact_person||""):""}:
 {name:clean(body.customer?.name),email:clean(body.customer?.email),address:clean(body.customer?.address,500),phone:clean(body.customer?.phone,70),contactId:"",paymentTermsDays:Number(body.customer?.paymentTermsDays??14),customerType:body.customer?.customerType==="business"?"business":"private",organizationNumber:body.customer?.customerType==="business"?clean(body.customer?.organizationNumber,9):"",contactPerson:body.customer?.customerType==="business"?clean(body.customer?.contactPerson,180):""};
 const chosenPaymentMethod=body.customer?.paymentMethod==="vipps"?"vipps":body.customer?.paymentMethod==="bank"?"bank":selected?.preferred_payment_method==="vipps"?"vipps":"bank";
 const workDate=chosenPaymentMethod==="vipps"?osloDateKey(new Date()):clean(body.customer?.workDate,10);
 const update={title:clean(body.title),customer:{...chosen,workDescription:clean(body.customer?.workDescription,3000),workDate,workAddress:clean(body.customer?.workAddress,500),paymentMethod:chosenPaymentMethod},pricing_model:body.pricingModel,line_items:body.lineItems.map(x=>({description:clean(x.description,500),type:clean(x.type,20),quantity:Number(x.quantity),unit:clean(x.unit,30),unitPriceOre:Number(x.unitPriceOre),vatRate:Number(x.vatRate)})),notes:clean(body.notes,4000),due_date:due,due_date_mode:mode,updated_at:new Date().toISOString()};
 const {data,error}=await s.from("invoice_drafts").update(update).eq("id",body.id).eq("status","draft")
  .eq("updated_at",body.expectedUpdatedAt).select("id,updated_at").maybeSingle();
 if(error)return fail("Fakturakladden kunne ikke lagres.",500);
 if(!data)return fail("Kladden er endret eller allerede utstedt i en annen fane. Last inn fakturaen på nytt for å unngå å overskrive nye kundeopplysninger eller priser.",409);
 return NextResponse.json({ok:true,updatedAt:data.updated_at,savedCustomer:update.customer});
}
