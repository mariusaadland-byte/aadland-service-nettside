import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {refreshSystimaTokens} from "../../../../../lib/systimaTokenLifecycle";
export const runtime="nodejs";
export const maxDuration=30;
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const owner=await getAdminUser();
 if(owner?.role!=="owner")return reply({error:"Bare eieren kan endre Systima-tilkoblingen."},403);
 if(process.env.VERCEL_ENV!=="production")
  return reply({error:"Tilkoblingen kan bare endres fra produksjon."},403);
 const body=await req.json().catch(()=>({}));
 if(body?.confirmed!==true||!["disconnect","refresh"].includes(body.action))
  return reply({error:"Bekreft ønsket handling."},400);
 const s=db();if(!s)return reply({error:"Databasen er utilgjengelig."},503);
 if(body.action==="disconnect"){
  const result=await s.from("systima_oauth_connections")
   .delete().eq("integration_key","systima").select("integration_key");
  if(result.error)return reply({error:"Lagrede tilgangstoken kunne ikke slettes."},503);
  const response=reply({ok:true,wasConnected:(result.data||[]).length>0,
   note:"Bare lokal tilkobling er fjernet. Tilgang hos Systima må om nødvendig tilbakekalles der."});
  response.cookies.set("aadland_systima_oauth_state","",{
   httpOnly:true,secure:true,sameSite:"lax",path:"/api/admin/systima",maxAge:0
  });
  return response;
 }
 const found=await s.from("systima_oauth_connections").select("encrypted_credentials")
  .eq("integration_key","systima").maybeSingle();
 if(found.error)return reply({error:"Kunne ikke kontrollere lagrede tilgangstoken."},503);
 if(!found.data?.encrypted_credentials)return reply({error:"Ingen Systima-tilkobling er lagret."},404);
 let result;
 try{result=await refreshSystimaTokens(found.data.encrypted_credentials);}
 catch{return reply({error:"Fornying ble ikke fullført. Kontroller oppsett eller godkjenn Systima på nytt. Ingen token ble endret."},409);}
 // Compare-and-swap: a concurrent disconnection or newer refresh must not be undone.
 const updated=await s.from("systima_oauth_connections")
  .update({encrypted_credentials:result.encrypted,updated_at:new Date().toISOString()})
  .eq("integration_key","systima").eq("encrypted_credentials",found.data.encrypted_credentials)
  .select("integration_key").maybeSingle();
 if(updated.error)return reply({error:"Kunne ikke lagre fornyede tilgangstoken."},503);
 if(!updated.data)return reply({error:"Tilkoblingen ble endret under fornyingen. Hent statusen på nytt."},409);
 return reply({ok:true,tokenHealth:result.health,
  note:"Token fornyet sikkert. Leverandørbilag blir fortsatt ikke lest eller importert."});
}
