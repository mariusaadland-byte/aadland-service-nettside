import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";

export const runtime="nodejs";
const validId=value=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const respond=(error,status=400)=>NextResponse.json({error},{status});
async function permitted(){
 const user=await getAdminUser();
 return user&&(user.role==="owner"||user.canUpdateOrders||user.canManageProducts);
}
async function findDraft(s,quoteId){
 return s.from("invoice_drafts").select("id,status").eq("source_quote_id",quoteId).eq("installment_index",0).maybeSingle();
}

// Prepare exactly one editable invoice draft, without issuing or sending anything.
// No customer approval of the quote is required in this explicitly chosen workflow;
// the agreed work/price must still be confirmed before the invoice is issued.
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 if(!await permitted())return respond("Ingen tilgang.",403);
 const input=await req.json().catch(()=>({}));
 if(!validId(input.quoteId))return respond("Velg et lagret tilbud.");
 if(!["bank","vipps"].includes(input.paymentMethod))return respond("Velg faktura på e-post eller Vipps.");
 const s=db();if(!s)return respond("Databasen er utilgjengelig.",503);
 const id=input.quoteId;
 const {data:quote,error:quoteError}=await s.from("quotes").select("*").eq("id",id).maybeSingle();
 if(quoteError||!quote)return respond("Tilbudet ble ikke funnet.",404);
 const {data:privateData,error:privateError}=await s.from("quote_internal_costs").select("line_costs").eq("quote_id",id).maybeSingle();
 if(privateError)return respond("Tilbudsvalgene kunne ikke kontrolleres.",500);
 const opts=privateData?.line_costs||{};
 if(opts.__directInvoice!==true||opts.__skipQuoteApproval!==true)return respond("Huk av både direkte fakturering og uten tilbudsgodkjenning, og lagre tilbudet først.");
 const current=await findDraft(s,id);
 if(current.error)return respond("Tidligere faktura kunne ikke kontrolleres.",500);
 if(current.data)return NextResponse.json({id:current.data.id,existing:true,status:current.data.status});
 if(quote.status!=="draft")return respond("Bare tilbudskladder i direkte-faktureringsmodus kan brukes her.");
 const contactId=String(quote.customer?.contactId||"");
 if(!validId(contactId))return respond("Velg en registrert kunde fra kunderegisteret før fakturering.");
 const {data:contact,error:contactError}=await s.from("admin_customer_contacts").select("id,name,email,phone,address,payment_terms_days,customer_type,organization_number,contact_person").eq("id",contactId).maybeSingle();
 if(contactError||!contact)return respond("Kundekortet ble ikke funnet. Velg kunden på nytt.",400);
 if(!contact.name||!contact.address)return respond("Fyll inn kundens navn og adresse i kundekortet før fakturering.");
 const lines=Array.isArray(quote.line_items)?quote.line_items:[];
 if(!lines.length||lines.length>120)return respond("Tilbudet må inneholde gyldige prislinjer.");
 let gross=0;
 for(const line of lines){
  const qty=Number(line.quantity),unit=Number(line.unitPriceOre),vat=Number(line.vatRate);
  if(!String(line.description||"").trim()||!Number.isFinite(qty)||qty<=0||!Number.isSafeInteger(unit)||unit<0||unit>100000000||![0,12,15,25].includes(vat))return respond("Kontroller priser, antall og MVA i tilbudet.");
  const net=Math.round(qty*unit);gross+=net+Math.round(net*vat/100);
 }
 if(!Number.isSafeInteger(gross)||gross<=0)return respond("Fakturaen må ha et beløp over null.");
 if(gross!==Number(quote.total_inc_vat_ore))return respond("Prissummen stemmer ikke med tilbudet. Lagre tilbudet på nytt før fakturering.",409);
 const title=String(quote.title||"Arbeid og materialer").slice(0,250);
 const pricingModel=String(quote.intro_text||"").startsWith("PRISFORM: TIMEARBEID")?"hourly":String(quote.intro_text||"").startsWith("PRISFORM: PRISOVERSLAG")?"estimate":"fixed";
 const customer={
  contactId:contact.id,
  name:contact.name,email:contact.email||"",phone:contact.phone||"",
  address:contact.address||"",paymentTermsDays:contact.payment_terms_days??14,
  customerType:contact.customer_type==="business"?"business":"private",
  organizationNumber:contact.customer_type==="business"?(contact.organization_number||""):"",
  contactPerson:contact.customer_type==="business"?(contact.contact_person||""):"",
  paymentMethod:input.paymentMethod,
  workDescription:title,
  workDate:""
 };
 const payload={
  source_quote_id:id,installment_index:0,
  title,customer,pricing_model:pricingModel,
  line_items:lines.map(l=>({description:String(l.description).slice(0,500),type:l.type||"work",quantity:Number(l.quantity),unit:String(l.unit||"stk"),unitPriceOre:Number(l.unitPriceOre),vatRate:Number(l.vatRate)})),
  notes:String(quote.notes||"").slice(0,4000),
  due_date_mode:"auto",status:"draft"
 };
 const {data:created,error:insertError}=await s.from("invoice_drafts").insert(payload).select("id").single();
 if(insertError){
  if(insertError.code==="23505"){
   const existing=await findDraft(s,id);
   if(!existing.error&&existing.data)return NextResponse.json({id:existing.data.id,existing:true,status:existing.data.status});
  }
  console.error("DIRECT QUOTE INVOICE CREATE",insertError.code);
  return respond("Fakturakladden kunne ikke opprettes. Prøv igjen uten å opprette et nytt tilbud.",500);
 }
 return NextResponse.json({id:created.id,existing:false,status:"draft"},{status:201});
}
