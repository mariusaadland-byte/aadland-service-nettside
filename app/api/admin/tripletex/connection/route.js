import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {tripletexCheckConnection,tripletexEnvironment} from "../../../../../lib/tripletexApi";
import {protectTripletexToken,unprotectTripletexToken,storedTripletexConnection} from "../../../../../lib/tripletexCredentials";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(value,status=200)=>NextResponse.json(value,{status,headers});

async function authorization(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return {error:json({error:"Bare eier kan koble til Tripletex."},403)};
 if(req.method==="POST"){
  const guard=sameOriginGuard(req);
  if(guard)return {error:guard};
  if(process.env.VERCEL_ENV!=="production")
   return {error:json({error:"Tripletex-tilkobling kan bare endres på den publiserte nettsiden."},403)};
 }
 return {user};
}
function publicState(connection){
 return {configured:Boolean(connection),environment:connection?.environment||null,
  verifiedAt:connection?.verified_at||null,
  directInvoiceTransferEnabled:false,
  needsMappingAndPilot:true};
}
export async function GET(req){
 const auth=await authorization(req);if(auth.error)return auth.error;
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const connection=await storedTripletexConnection(s);
  return json({ok:true,...publicState(connection)});
 }catch{
  return json({error:"Kunne ikke hente Tripletex-status."},503);
 }
}

export async function POST(req){
 const auth=await authorization(req);if(auth.error)return auth.error;
 const body=await req.json().catch(()=>({}));
 const action=body?.action;
 if(!["connect","check","disconnect"].includes(action))
  return json({error:"Ukjent Tripletex-handling."},400);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  if(action==="connect"){
   const environment=tripletexEnvironment(body.environment);
   const refreshToken=typeof body.refreshToken==="string"?body.refreshToken.trim():"";
   if(!environment||refreshToken.length<30||refreshToken.length>8192||
    !/^[A-Za-z0-9._-]+$/.test(refreshToken))
    return json({error:"Oppgi en gyldig JWT-nøkkel og riktig Tripletex-miljø."},400);
   // Validate the candidate at Tripletex BEFORE saving anything.
   const validation=await tripletexCheckConnection(refreshToken,environment);
   const sealed=protectTripletexToken(refreshToken);
   const current=await storedTripletexConnection(s);
   // Replacing a connection with existing accounting transfers can point to
   // another company; disallow without dedicated reconciliation.
   if(current&&current.environment!==environment){
    const {count,error:countErr}=await s.from("invoice_tripletex_transfers")
     .select("id",{count:"exact",head:true});
    if(countErr||Number(count)>0)
     return json({error:"Det finnes tidligere fakturaoverføringer. Tripletex-miljø kan ikke byttes uten manuell avstemming."},409);
   }
   const now=new Date().toISOString();
   const saved=await s.from("tripletex_api_connections").upsert({
    id:"primary",environment,...sealed,verified_at:now,updated_at:now
   },{onConflict:"id"}).select("id,environment,verified_at").single();
   if(saved.error||!saved.data)throw Error("Store failed");
   return json({ok:true,...publicState(saved.data),connectionTest:validation,
    message:"API-nøkkelen er kontrollert hos Tripletex og lagret kryptert på serveren."});
  }
  const saved=await storedTripletexConnection(s);
  if(!saved)return json({error:"Tripletex er ikke koblet til ennå."},404);
  if(action==="check"){
   const validation=await tripletexCheckConnection(unprotectTripletexToken(saved),saved.environment);
   const now=new Date().toISOString();
   const update=await s.from("tripletex_api_connections")
    .update({verified_at:now,updated_at:now}).eq("id","primary");
   if(update.error)throw Error("Validation state update failed");
   return json({ok:true,...publicState({...saved,verified_at:now}),connectionTest:validation});
  }
  // Explicit disconnect never deletes accounting records.
  if(body.confirmed!==true)return json({error:"Du må bekrefte frakoblingen."},400);
  const removed=await s.from("tripletex_api_connections").delete().eq("id","primary");
  if(removed.error)throw Error("Disconnect failed");
  return json({ok:true,configured:false,environment:null,verifiedAt:null,
   directInvoiceTransferEnabled:false,
   message:"API-tilkoblingen er fjernet. Tidligere fakturaoverføringer er bevart."});
 }catch(error){
  // Never log JWT, decrypted secrets, provider bodies or sensitive invoice details.
  const isRemote=error?.name==="TripletexApiError";
  return json({error:isRemote?error.message:
   "Kunne ikke kontrollere eller lagre Tripletex-tilkoblingen."},isRemote?400:503);
 }
}
