import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {getAdminUser} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {systimaSetupStatus,SYSTIMA_AUTHORIZATION_URL} from "../../../../lib/systimaIntegrationStatus";
export const runtime="nodejs";
const cookieName="aadland_systima_oauth_state";
const respond=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 const user=await getAdminUser();
 if(user?.role!=="owner")return respond({error:"Ingen tilgang."},403);
 const status=systimaSetupStatus();
 const s=db();if(!s)return respond({error:"Databasen er utilgjengelig."},503);
 const result=await s.from("systima_oauth_connections")
  .select("authorized_at,connection_state,updated_at")
  .eq("integration_key","systima").maybeSingle();
 if(result.error)return respond({error:"Tilkoblingsstatus kunne ikke hentes."},503);
 return respond({...status,hasAuthorization:Boolean(result.data),
  authorizedAt:result.data?.authorized_at||null,
  accessToSupplierDocuments:false,
  connectionState:result.data?.connection_state||"not_connected"});
}
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();
 if(user?.role!=="owner")return respond({error:"Bare eieren kan starte tilkobling."},403);
 if(process.env.VERCEL_ENV!=="production")
  return respond({error:"OAuth kan bare startes fra produksjonssiden."},403);
 const body=await req.json().catch(()=>({}));
 if(body.action!=="start"||body.confirmed!==true)
  return respond({error:"Bekreft tilkoblingen."},400);
 const status=systimaSetupStatus();
 if(!status.connectionAvailable)
  return respond({error:"Systima-integrasjonen er ikke ferdig konfigurert eller aktivert."},409);
 const state=crypto.randomBytes(32).toString("base64url");
 const loginUrl=new URL(SYSTIMA_AUTHORIZATION_URL);
 loginUrl.searchParams.set("clientId",process.env.SYSTIMA_CLIENT_ID.trim());
 loginUrl.searchParams.set("state",state);
 const response=respond({authorizeUrl:loginUrl.toString(),note:"Kun OAuth-autorisasjon. Ingen bilag hentes."});
 response.cookies.set(cookieName,state+"."+user.id,{
  httpOnly:true,secure:true,sameSite:"lax",path:"/api/admin/systima",maxAge:600
 });
 return response;
}
