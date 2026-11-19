import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {storedTripletexConnection,unprotectTripletexToken} from "../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead,tripletexCreateCustomer,tripletexUpdateCustomer} from "../../../../../lib/tripletexApi";
import {customerTransferKey,findTripletexCustomerForTransfer,tripletexCustomerPayload,tripletexCustomerCorrection} from "../../../../../lib/tripletexCustomerSync";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});
const uuid=s=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const cols={
 contact:"id,name,email,phone,address,customer_type,organization_number,updated_at",
 profile:"id,name,email,phone,address,updated_at"
};
const sourceTable={contact:"admin_customer_contacts",profile:"customer_profiles"};
function fromLocal(sourceType,row){
 return {
  sourceType,id:row.id,name:String(row.name||"").trim().slice(0,255),
  email:String(row.email||"").trim(),phone:String(row.phone||"").trim(),
  address:String(row.address||"").trim(),updatedAt:row.updated_at||null,
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
  .select("status,tripletex_customer_id,last_error,linked_at,updated_at")
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
 if(!key)return {state:"invalid",reason:"Legg inn kundenavn på kundekortet først."};
 // Name-only matching must scan all customers, not rely on an unverified name filter.
 // A full page stops safely at 1000 customers, rather than risking duplicate creation.
 const path=key.kind==="name"?"/customer?count=1000":
  "/customer?"+key.kind+"="+encodeURIComponent(key.value)+"&count=100";
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
    .select("source_type,source_id,status,tripletex_customer_id,last_error,linked_at")
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
    const hasDetails=Boolean(x.email||x.phone||x.address||x.organizationNumber);
    const needsUpdate=link?.status==="linked"&&Boolean(
     x.updatedAt&&link.linked_at&&Date.parse(x.updatedAt)>Date.parse(link.linked_at)+500
    );
    return {...x,phone:x.sourceType==="profile"?x.phone:undefined,hasPhone:Boolean(x.phone),hasDetails,
     status:link?.status||"pending",needsUpdate,
     tripletexCustomerId:link?.tripletex_customer_id||null,
     problem:link?.status==="needs_review"?
      "Forrige handling må kontrolleres i Tripletex før du forsøker på nytt.":""
    };
   }).sort((a,b)=>a.name.localeCompare(b.name,"nb-NO"))
  });
 }catch{return json({error:"Kunne ikke hente kundene og Tripletex-statusen."},503);}
}
export async function POST(req){
 const denied=await canAccess(req,true);if(denied)return denied;
 const body=await req.json().catch(()=>({}));
 const sourceType=body.sourceType,sourceId=body.sourceId;
 const action=["check","transfer","update","retryUpdate","retryCreate","saveProfile"].includes(body.action)?
  body.action:"transfer";
 if(!Object.hasOwn(sourceTable,sourceType)||!uuid(sourceId))
  return json({error:"Velg en gyldig kunde fra listen."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 let claimed=false,customer=null,environment=null,isCorrection=false;
 try{
  if(action==="saveProfile"){
   if(sourceType!=="profile")return json({error:"Bruk kundekortet til å redigere denne kunden."},400);
   const name=String(body.name||"").trim().slice(0,120);
   const phone=String(body.phone||"").trim().slice(0,40);
   const address=String(body.address||"").trim().slice(0,300);
   if(name.length<2||!body.updatedAt)return json({error:"Oppgi kundenavn og last inn kundekortet på nytt."},400);
   const saved=await s.from("customer_profiles").update({
    name,phone,address,updated_at:new Date().toISOString()
   }).eq("id",sourceId).eq("updated_at",body.updatedAt)
    .select(cols.profile).maybeSingle();
   if(saved.error||!saved.data)return json({error:"Kunden ble endret andre steder. Last inn kundelisten på nytt."},409);
   return json({ok:true,customer:fromLocal("profile",saved.data)});
  }
  const connection=await storedTripletexConnection(s);
  if(!connection)return json({error:"Tripletex må kobles til først."},409);
  environment=connection.environment;
  customer=await getSource(s,sourceType,sourceId);
  if(!customer)return json({error:"Kunden finnes ikke lenger i Aadland Service."},404);
  const key=customerTransferKey(customer);
  if(!key)return json({error:"Kunden trenger et gyldig navn før overføring."},409);
  const previous=await getLink(s,customer,environment);
  if(action==="transfer"&&previous?.status==="linked")
   return json({ok:true,status:"linked",tripletexCustomerId:previous.tripletex_customer_id,existing:true});
  if(action==="transfer"&&previous)
   return json({error:"Denne kunden har en tidligere uavklart overføring. Bruk «Kontroller» før ny overføring."},409);
  if(action==="retryCreate"){
   // Only permit an explicit owner-requested retry of an unresolved first-time
   // customer creation, never of a linked customer or an in-flight request.
   if(previous?.status!=="needs_review"||previous.tripletex_customer_id!=null)
    return json({error:"Bare nye kunder uten bekreftet Tripletex-ID kan kontrolleres på nytt."},409);
   if(Date.now()-Date.parse(previous.updated_at||"")<60000)
    return json({error:"Forrige forsøk må avklares før en ny kontroll."},409);
  }
  const session=await tripletexOpenSession(unprotectTripletexToken(connection),environment);
  if(action==="update"||action==="retryUpdate"){
   if(!previous?.tripletex_customer_id||
    (action==="update"&&previous.status!=="linked")||
    (action==="retryUpdate"&&previous.status!=="needs_review"))
    return json({error:"Kunden har ingen sikker Tripletex-kobling for korrigering."},409);
   const customerId=Number(previous.tripletex_customer_id);
   const fetched=await tripletexRead("/customer/"+customerId,session,environment);
   const remote=fetched.value;
   if(Number(remote?.id)!==customerId)
    return json({error:"Tripletex bekreftet ikke riktig kunde-ID. Ingen endring sendt."},409);
   const correction=tripletexCustomerCorrection(customer,remote);
   if(correction.hasChanges){
    const lock=await s.from("tripletex_customer_links").update({
     status:"processing",last_error:null,updated_at:new Date().toISOString()
    }).eq("source_type",sourceType).eq("source_id",sourceId)
     .eq("environment",environment).eq("status",previous.status)
     .eq("tripletex_customer_id",customerId)
     .select("source_id").maybeSingle();
    if(lock.error||!lock.data)
     return json({error:"Kunden er allerede under behandling. Oppdater listen."},409);
    claimed=true;isCorrection=true;
    await tripletexUpdateCustomer(customerId,correction.payload,session,environment);
   }
   await saveLink(s,customer,environment,customerId);
   claimed=false;
   return json({ok:true,status:"linked",tripletexCustomerId:customerId,updated:true,
    unchanged:!correction.hasChanges,warnings:correction.warnings});
  }
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
  if(action==="retryCreate"&&match.state!=="new")
   return json({error:"Kunden kan allerede finnes i Tripletex. Opprettelsen er stoppet for å unngå duplikat."},409);
  if(action==="retryCreate"){
   // Atomic state transition: two clicks can never submit parallel POSTs.
   const lock=await s.from("tripletex_customer_links").update({
    status:"processing",last_error:null,updated_at:new Date().toISOString()
   }).eq("source_type",sourceType).eq("source_id",sourceId)
    .eq("environment",environment).eq("status","needs_review")
    .is("tripletex_customer_id",null).select("source_id").maybeSingle();
   if(lock.error||!lock.data)
    return json({error:"Kunden er under kontroll eller tidligere koblet. Oppdater listen."},409);
   claimed=true;
  }else{
   const claim=await s.from("tripletex_customer_links").insert({
    source_type:sourceType,source_id:sourceId,environment,status:"processing"
   });
   if(claim.error){
    if(claim.error.code==="23505")
     return json({error:"Kunden behandles allerede eller finnes i overføringsloggen. Last inn listen på nytt."},409);
    throw Error("Kunne ikke sikre kundeoverføringen.");
   }
   claimed=true;
  }
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
  const reason=error?.name==="TripletexApiError"?
   error.message:"Fikk ikke bekreftet svar fra Tripletex.";
  return json({error:claimed?
   (isCorrection?
    "Korrigeringen er uavklart. Kontroller kunden i Tripletex før et nytt forsøk.":
    "Overføringen er ikke bekreftet ("+reason+"). Trykk «Kontroller og prøv igjen» for å søke etter kunden først."):
   reason,status:claimed?"needs_review":undefined},claimed?409:503);
 }
}
