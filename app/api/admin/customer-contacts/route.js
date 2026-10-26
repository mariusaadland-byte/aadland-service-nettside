import {NextResponse} from "next/server";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";

async function allowed(){
 const user=await getAdminUser();
 return Boolean(user&&(user.role==="owner"||user.canViewOrders||user.canUpdateOrders||user.canManageProducts));
}
const fields="id,name,email,phone,address,payment_terms_days,customer_type,organization_number,contact_person,internal_note,preferred_payment_method,created_at,updated_at";
const map=r=>({id:r.id,name:r.name,email:r.email||"",phone:r.phone||"",address:r.address||"",paymentTermsDays:r.payment_terms_days??14,customerType:r.customer_type||"private",organizationNumber:r.organization_number||"",contactPerson:r.contact_person||"",internalNote:r.internal_note||"",preferredPaymentMethod:r.preferred_payment_method||"bank",createdAt:r.created_at,updatedAt:r.updated_at});
function sanitize(body){
 const name=String(body.name||"").trim().slice(0,180);
 const email=String(body.email||"").trim().toLowerCase().slice(0,240);
 const phone=String(body.phone||"").trim().slice(0,70);
 const address=String(body.address||"").trim().slice(0,500);
 const days=Number(body.paymentTermsDays??14);
 const customerType=String(body.customerType||"private");
 const organizationNumber=String(body.organizationNumber||"").replace(/\s/g,"").trim();
 const contactPerson=String(body.contactPerson||"").trim().slice(0,180);
 const internalNote=String(body.internalNote||"").trim().slice(0,1000);
 const preferredPaymentMethod=String(body.preferredPaymentMethod||"bank");
 if(!Number.isInteger(days)||days<0||days>365)return {error:"Betalingsfrist må være fra 0 til 365 dager."};
 if(!name)return {error:"Skriv inn kundens navn."};
 if(!["private","business"].includes(customerType))return {error:"Velg privatkunde eller bedrift."};
 if(organizationNumber&&!/^[0-9]{9}$/.test(organizationNumber))return {error:"Organisasjonsnummer må være nøyaktig 9 sifre."};
 if(!["bank","vipps"].includes(preferredPaymentMethod))return {error:"Velg en gyldig standard betalingsmåte."};
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {error:"Ugyldig e-postadresse."};
 return {data:{payment_terms_days:days,name,email:email||null,phone:phone||null,address:address||null,customer_type:customerType,organization_number:customerType==="business"?(organizationNumber||null):null,contact_person:customerType==="business"?(contactPerson||null):null,internal_note:internalNote||null,preferred_payment_method:preferredPaymentMethod,updated_at:new Date().toISOString()}};
}
export async function GET(request){
 if(!await allowed())return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er utilgjengelig."},{status:503});
 const url=new URL(request?.url||"https://localhost/api/admin/customer-contacts");
 if(url.searchParams.has("organizationNumber")){
  const org=String(url.searchParams.get("organizationNumber")||"").replace(/\s/g,"");
  if(!/^[0-9]{9}$/.test(org))
   return NextResponse.json({error:"Oppgi et gyldig organisasjonsnummer."},{status:400});
  const {data,error}=await s.from("admin_customer_contacts").select(fields)
   .eq("organization_number",org).maybeSingle();
  if(error)return NextResponse.json({error:"Kunne ikke kontrollere eksisterende bedriftskunde."},{status:503});
  return NextResponse.json({contact:data?map(data):null},{headers:{"Cache-Control":"private, no-store"}});
 }
 const {data,error}=await s.from("admin_customer_contacts").select(fields).order("name").limit(1000);
 if(error)return NextResponse.json({error:"Kundelisten kunne ikke hentes."},{status:500});
 return NextResponse.json({contacts:(data||[]).map(map)});
}
export async function POST(request){
 const guard=sameOriginGuard(request);if(guard)return guard;
 const user=await getAdminUser();
 if(!user||!(user.role==="owner"||user.canUpdateOrders||user.canManageProducts))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const input=sanitize(await request.json().catch(()=>({})));if(input.error)return NextResponse.json({error:input.error},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er utilgjengelig."},{status:503});
 if(input.data.organization_number){
  const {data:match,error:checkError}=await s.from("admin_customer_contacts")
   .select(fields).eq("organization_number",input.data.organization_number).maybeSingle();
  if(checkError)return NextResponse.json({error:"Kunne ikke kontrollere organisasjonsnummeret."},{status:503});
  if(match)return NextResponse.json({contact:map(match),existing:true,
   message:"Bedriften finnes allerede i kunderegisteret. Eksisterende kundekort er valgt."});
 }
 if(input.data.email){
  const {data:existing,error:lookupError}=await s.from("admin_customer_contacts").select(fields).eq("email",input.data.email).maybeSingle();
  if(lookupError)return NextResponse.json({error:"Kunne ikke sjekke eksisterende kunde."},{status:500});
  if(existing){
   if(input.data.organization_number&&existing.organization_number!==input.data.organization_number)
    return NextResponse.json({error:"E-postadressen tilhører allerede et annet kundekort. Åpne og kontroller kunden først."},{status:409});
   return NextResponse.json({contact:map(existing),existing:true});
  }
 }
 const {data,error}=await s.from("admin_customer_contacts").insert(input.data).select(fields).single();
 if(error){console.error("ADMIN CUSTOMER CONTACT CREATE",error);return NextResponse.json({error:"Kunden kunne ikke opprettes. Sjekk om e-posten er i bruk."},{status:500})}
 return NextResponse.json({contact:map(data),existing:false},{status:201});
}

export async function PATCH(request){
 const guard=sameOriginGuard(request);if(guard)return guard;
 const user=await getAdminUser();
 if(!user||!(user.role==="owner"||user.canUpdateOrders||user.canManageProducts))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await request.json().catch(()=>({}));
 const input=sanitize(body);if(input.error)return NextResponse.json({error:input.error},{status:400});
 if(!/^[0-9a-f-]{36}$/i.test(body.id||""))return NextResponse.json({error:"Velg en kunde."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er utilgjengelig."},{status:503});
 const {data,error}=await s.rpc("update_invoice_customer_card_v2",{p_id:body.id,p_expected_updated_at:body.updatedAt,p_name:input.data.name,p_email:input.data.email||"",p_phone:input.data.phone||"",p_address:input.data.address||"",p_payment_terms_days:input.data.payment_terms_days,p_customer_type:input.data.customer_type,p_organization_number:input.data.organization_number,p_contact_person:input.data.contact_person,p_internal_note:input.data.internal_note,p_preferred_payment_method:input.data.preferred_payment_method});
 if(error)return NextResponse.json({error:error.code==="23505"?"E-postadressen er knyttet til et annet kundekort.":error.message||"Kundekortet kunne ikke lagres."},{status:400});
 return NextResponse.json({contact:map(data)});
}
