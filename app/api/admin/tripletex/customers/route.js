import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {storedTripletexConnection,unprotectTripletexToken} from "../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead,tripletexCreateCustomer} from "../../../../../lib/tripletexApi";
import {customerTransferKey,findTripletexCustomerForTransfer,tripletexCustomerPayload} from "../../../../../lib/tripletexCustomerSync";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});
const uuid=s=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const cols={
 contact:"id,name,email,phone,address,customer_type,organization_number",
 profile:"id,name,email,phone,address"
};
const sourceTable={contact:"admin_customer_contacts",profile:"customer_profiles"};
function fromLocal(sourceType,row){
 return {
  sourceType,id:row.id,name:String(row.name||"").trim().slice(0,255),
  email:String(row.email||"").trim(),phone:String(row.phone||"").trim(),
  address:String(row.address||"").trim(),
  customerType:sourceType==="contact"&&row.customer_type==="business"?"business":"private",
  organizationNumber:sourceType==="contact"?String(row.organization_number||""):""
 };
}
async function getSource(s,sourceType,id){
 const {data,error}=await s.from(sourceTable[sourceType]).select(cols[sourceType]).eq("id",id).maybeSingle();
 if(error)throw Error("Kundekortet kunne ikke leses.");
 return data?fromLocal(sourceType,data):null;
}
async function allSources(s,sourceType){
 const {data,error}=await s.from(sourceTable[sourceType]).select(cols[sourceType])
  .order("id",{ascending:true}).limit(1501);
 if(error||!Array.isArray(data))throw Error("Kunderegisteret kunne ikke hentes.");
 if(data.length>1500)throw Error("Kunderegisteret er for stort for denne overføringsoversikten.");
 return data.map(x=>fromLocal(sourceType,x)).filter(x=>x.name);
}
async function getLink(s,customer,environment){
 const {data,error}=await s.from("tripletex_customer_links")
  .select("status,tripletex_customer_id,last_error")
  .eq("source_type",customer.sourceType).eq("source_id",customer.id)
  .eq("environment",environment).maybeSingle();
 if(error)throw Error("Kunne ikke kontrollere tidligere kundeoverføringer.");
 return data;
}
async function saveLink(s,customer,environment,remoteId){
 const {error}=await s.from("tripletex_customer_links").update({
  status:"linked",tripletex_customer_id:remoteId,last_error:null,
  linked_at:new Date().toISOString(),updated_at:new Date().toISOString()
 }).eq("source_type",customer.sourceType).eq("source_id",customer.id)
  .eq("environment",environment);
 if(error)throw Error("Tripletex kan ha opprettet kunden, men lagring av koblingen feilet. Kontroller manuelt.");
}
async function findRemote(customer,session,environment){
 const key=customerTransferKey(customer);
 if(!key)return {state:"invalid",reason:"Legg inn e-post eller organisasjonsnummer på kundekortet først."};
 const path="/customer?"+key.kind+"="+encodeURIComponent(key.value)+"&count=100";
 const result=await tripletexRead(path,session,environment);
 if(!Array.isArray(result.values))throw Error("Tripletex returnerte ikke en gyldig kundeliste.");
 return findTripletexCustomerForTransfer(customer,result.values);
}
async function canAccess(req,write){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan overføre kunder til Tripletex."},403);
 if(write){
  const guard=sameOriginGuard(req);if(guard)return guard;
  if(process.env.VERCEL_ENV!=="production")
   return json({error:"Kundeoverføring kan bare startes på den publiserte nettsiden."},403);
 }
 return null;
}
export async function GET(req){
 const denied=await canAccess(req,false);if(denied)return denied;
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const connection=await storedTripletexConnection(s);
  if(!connection)return json({configured:false,customers:[]});
  const [contacts,profiles,linksQuery]=await Promise.all([
   allSources(s,"contact"),allSources(s,"profile"),
   s.from("tripletex_customer_links")
    .select("source_type,source_id,status,tripletex_customer_id,last_error")
    .eq("environment",connection.environment).limit(5000)
  ]);
  if(linksQuery.error)throw Error("Overføringsloggen kan ikke leses.");
  const links=new Map((linksQuery.data||[]).map(x=>[x.source_type+":"+x.source_id,x]));
  const contactEmails=new Set(contacts.map(x=>x.email.toLowerCase()).filter(Boolean));
  // A logged-in customer may also have a dedicated CRM card: show the CRM card once.
  const unique=[...contacts,...profiles.filter(x=>!x.email||!contactEmails.has(x.email.toLowerCase()))];
  return json({configured:true,environment:connection.environment,
   customers:unique.map(x=>{
    const link=links.get(x.sourceType+":"+x.id);
    return {...x,address:undefined,phone:undefined,organizationNumber:x.organizationNumber,
     status:link?.status||"pending",tripletexCustomerId:link?.tripletex_customer_id||null,
     problem:link?.status==="needs_review"?
      "Krever kontroll i Tripletex før du forsøker på nytt.":""
    };
   }).sort((a,b)=>a.name.localeCompare(b.name,"nb-NO"))
  });
 }catch{return json({error:"Kunne ikke hente kundene og Tripletex-statusen."},503);}
}
export async function POST(req){
 const denied=await canAccess(req,true);if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 const sourceType=body.sourceType,sourceId=body.sourceId;
 const action=body.action==="check"?"check":"transfer";
 if(!Object.hasOwn(sourceTable,sourceType)||!uuid(sourceId))
  return json({error:"Velg en gyldig kunde fra listen."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 let claimed=false,customer=null,environment=null;
 try{
  const connection=await storedTripletexConnection(s);
  if(!connection)return json({error:"Tripletex må kobles til først."},409);
  environment=connection.environment;
  customer=await getSource(s,sourceType,sourceId);
  if(!customer)return json({error:"Kunden finnes ikke lenger i Aadland Service."},404);
  const key=customerTransferKey(customer);
  if(!key)return json({error:"Kunden trenger gyldig e-post eller organisasjonsnummer før overføring."},409);
  const previous=await getLink(s,customer,environment);
  if(previous?.status==="linked")
   return json({ok:true,status:"linked",tripletexCustomerId:previous.tripletex_customer_id,existing:true});
  if(action==="transfer"&&previous)
   return json({error:"Denne kunden har en tidligere uavklart overføring. Bruk «Kontroller» før ny overføring."},409);
  const session=await tripletexOpenSession(unprotectTripletexToken(connection),environment);
  const match=await findRemote(customer,session,environment);
  if(match.state==="invalid"||match.state==="review")
   return json({error:match.reason,status:"needs_review"},409);
  if(action==="check"){
   if(match.state!=="existing")
    return json({error:"Ingen entydig eksisterende kunde ble funnet i Tripletex. Ingen ny kunde er opprettet.",status:"needs_review"},409);
   if(!previous)
    return json({error:"Kunden har ingen uavklart overføring. Bruk vanlig overføring for å lagre koblingen.",status:"needs_review"},409);
   await saveLink(s,customer,environment,match.id);
   return json({ok:true,status:"linked",tripletexCustomerId:match.id,existing:true});
  }
  const claim=await s.from("tripletex_customer_links").insert({
   source_type:sourceType,source_id:sourceId,environment,status:"processing"
  });
  if(claim.error){
   if(claim.error.code==="23505")
    return json({error:"Kunden behandles allerede eller finnes i overføringsloggen. Last inn listen på nytt."},409);
   throw Error("Kunne ikke sikre kundeoverføringen.");
  }
  claimed=true;
  const remoteId=match.state==="existing"?match.id:
   await tripletexCreateCustomer(tripletexCustomerPayload(customer),session,environment);
  await saveLink(s,customer,environment,remoteId);
  claimed=false;
  return json({ok:true,status:"linked",tripletexCustomerId:remoteId,existing:match.state==="existing"});
 }catch(error){
  if(claimed&&customer&&environment){
   await s.from("tripletex_customer_links").update({
    status:"needs_review",last_error:"Uavklart overføring. Kontroller Tripletex før nytt forsøk.",
    updated_at:new Date().toISOString()
   }).eq("source_type",customer.sourceType).eq("source_id",customer.id)
    .eq("environment",environment).eq("status","processing");
  }
  return json({error:claimed?
   "Overføringen er usikker. Kontroller om kunden finnes i Tripletex før du prøver igjen.":
   error?.name==="TripletexApiError"?error.message:
   "Kundeoverføringen kunne ikke gjennomføres. Ingen ny overføring bekreftet.",
   status:claimed?"needs_review":undefined},claimed?409:503);
 }
}
