import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {db} from "../../../../../lib/supabase";
import {storedTripletexConnection} from "../../../../../lib/tripletexCredentials";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(data,status=200)=>NextResponse.json(data,{status,headers});
const uuid=value=>typeof value==="string"&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const normalize=x=>String(x||"").trim().replace(/\s+/g," ").toLocaleLowerCase("nb-NO");
const contactFields="id,name,email,phone,address,customer_type,organization_number,contact_person,payment_terms_days,updated_at";

async function invoiceSource(s,kind,id){
 if(kind==="external"){
  const {data,error}=await s.from("external_customer_invoices")
   .select("id,customer_name,invoice_number,source_system")
   .eq("id",id).maybeSingle();
  if(error)throw Error("Kunne ikke lese den eksterne fakturaen.");
  return data?{name:String(data.customer_name||"").trim(),
   number:data.invoice_number,source:data.source_system,
   email:"",phone:"",address:"",customerType:"private",
   organizationNumber:"",contactPerson:"",contactId:null}:null;
 }
 const {data,error}=await s.from("invoice_drafts")
  .select("id,status,customer,invoice_number")
  .eq("id",id).maybeSingle();
 if(error)throw Error("Kunne ikke lese Aadland-fakturaen.");
 if(!data||data.status!=="sent")return null;
 const c=data.customer||{};
 return {name:String(c.name||"").trim(),number:data.invoice_number,
  source:"Aadland Service",email:String(c.email||"").trim(),
  phone:String(c.phone||"").trim(),address:String(c.address||"").trim(),
  customerType:c.customerType==="business"?"business":"private",
  organizationNumber:String(c.organizationNumber||"").trim(),
  contactPerson:String(c.contactPerson||"").trim(),
  contactId:uuid(c.contactId)?c.contactId:null};
}
async function localLink(s,kind,id){
 const {data,error}=await s.from("invoice_customer_card_links")
  .select("contact_id,linked_at").eq("invoice_kind",kind).eq("invoice_id",id)
  .maybeSingle();
 if(error)throw Error("Kunne ikke lese kundekortkoblingen.");
 return data;
}
async function contact(s,id){
 const {data,error}=await s.from("admin_customer_contacts")
  .select(contactFields).eq("id",id).maybeSingle();
 if(error)throw Error("Kundekortet kunne ikke leses.");
 return data;
}
export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Kun eier kan koble utstedte fakturaer til kundekort."},403);
 const q=new URL(req.url).searchParams;
 const kind=q.get("kind"),id=q.get("id");
 if(!["native","external"].includes(kind)||!uuid(id))
  return json({error:"Ugyldig faktura."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const source=await invoiceSource(s,kind,id);
  if(!source?.name)return json({error:"Fakturaen har ikke gyldige kundeopplysninger."},404);
  const [link,list,connection]=await Promise.all([
   localLink(s,kind,id),
   s.from("admin_customer_contacts").select(contactFields).order("name").limit(1001),
   storedTripletexConnection(s)
  ]);
  if(list.error||!Array.isArray(list.data))
   throw Error("Kunderegisteret kunne ikke leses.");
  const tooMany=list.data.length>1000;
  const customers=list.data.slice(0,1000);
  const linkedId=link?.contact_id||source.contactId;
  const linked=linkedId?
   customers.find(c=>c.id===linkedId)||await contact(s,linkedId):null;
  if(linkedId&&!linked)
   throw Error("Fakturaen viser til et kundekort som ikke finnes. Kontroller før nye endringer.");
  let tripletex=null;
  if(linked&&connection){
   const res=await s.from("tripletex_customer_links")
    .select("status,tripletex_customer_id")
    .eq("source_type","contact").eq("source_id",linked.id)
    .eq("environment",connection.environment).maybeSingle();
   if(res.error)throw Error("Tripletex-koblingen kunne ikke leses.");
   tripletex=res.data||{status:"pending",tripletex_customer_id:null};
  }
  const matching=customers.filter(x=>
   normalize(x.name)===normalize(source.name)||
   Boolean(source.email&&normalize(x.email)===normalize(source.email))||
   Boolean(source.organizationNumber&&
    x.organization_number===source.organizationNumber));
  return json({ok:true,invoice:source,linkedContact:linked,
   linkedFromInvoice:!link&&Boolean(source.contactId),
   tripletex:tripletex?{
    status:tripletex.status,
    customerId:tripletex.tripletex_customer_id||null
   }:null,tripletexConfigured:Boolean(connection),customers,
   suggestedIds:matching.map(x=>x.id),truncated:tooMany});
 }catch(e){
  return json({error:String(e.message||"Kunne ikke kontrollere kundekortet.").slice(0,300)},503);
 }
}
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Kun eier kan knytte kundekort til fakturaer."},403);
 if(process.env.VERCEL_ENV!=="production")
  return json({error:"Kundekortkobling er kun tilgjengelig i produksjon."},403);
 const body=await req.json().catch(()=>({}));
 const kind=body.kind,id=body.id,contactId=body.contactId;
 if(body.action!=="link"||body.confirmed!==true||
  !["native","external"].includes(kind)||!uuid(id)||!uuid(contactId))
  return json({error:"Velg og bekreft et gyldig kundekort."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const source=await invoiceSource(s,kind,id);
  if(!source?.name)return json({error:"Fakturaen ble ikke funnet."},404);
  const selected=await contact(s,contactId);
  if(!selected)return json({error:"Kundekortet finnes ikke lenger."},404);
  if(source.contactId&&source.contactId!==contactId)
   return json({error:"Utstedt faktura er allerede knyttet til et annet kundekort. Oppdater ikke originalen."},409);
  if(normalize(source.name)!==normalize(selected.name)&&body.nameMismatchConfirmed!==true)
   return json({error:"Kundenavnet er ulikt fakturaen. Kontroller dette og bekreft koblingen særskilt."},409);
  const prev=await localLink(s,kind,id);
  if(prev){
   if(prev.contact_id!==contactId)
    return json({error:"Fakturaen er allerede knyttet til et annet kundekort. Ingen endring er gjort."},409);
   return json({ok:true,existing:true,contactId});
  }
  const added=await s.from("invoice_customer_card_links").insert({
   invoice_kind:kind,invoice_id:id,contact_id:contactId,linked_by:user.id
  });
  if(added.error){
   if(added.error.code==="23505")
    return json({error:"Kundekortet kan være koblet i en annen fane. Oppdater oversikten før nytt forsøk."},409);
   throw Error("Kundekortkoblingen kunne ikke lagres.");
  }
  return json({ok:true,existing:false,contactId});
 }catch(e){return json({error:String(e.message||"Kundekortet kunne ikke kobles.").slice(0,250)},503);}
}
