import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {db} from "../../../../../lib/supabase";
import {rentalManualInput,rentalManualMatches} from "../../../../../lib/rentalManuals.mjs";
const json=(b,status=200)=>NextResponse.json(b,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(process.env.VERCEL_ENV!=="production"||process.env.RENTAL_MANUALS_ENABLED!=="true")return json({error:"Registeret er ikke aktivert."},503);
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();if(!user||!(user.role==="owner"||await hasPermission("canManageProducts")))return json({error:"Ingen tilgang."},403);
 const body=await req.json().catch(()=>null),input=rentalManualInput(body);
 if(!input)return json({error:"Kontroller produsent, modell, HTTPS-lenke, språk og bekreftelse."},400);
 if(input.published&&process.env.RENTAL_MANUALS_PUBLIC_ENABLED!=="true")return json({error:"Publisering av bruksanvisninger er ikke åpnet."},409);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 const lookup=()=>s.from("rental_manual_versions").select("*").eq("id",input.id).maybeSingle();
 const prior=await lookup();if(prior.error)return json({error:"Registeret kunne ikke kontrolleres."},503);
 if(prior.data)return rentalManualMatches(prior.data,input)?json({ok:true,reused:true}):json({error:"Forespørselen er i konflikt."},409);
 const item=await s.from("rental_items").select("id").eq("id",input.rental_item_id).maybeSingle();
 if(item.error||!item.data)return json({error:"Produktet kunne ikke kontrolleres."},404);
 const current=await s.from("rental_manual_versions").select("id").eq("rental_item_id",input.rental_item_id).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(1).maybeSingle();
 if(current.error)return json({error:"Tidligere versjon kunne ikke kontrolleres."},503);
 if((current.data?.id||null)!==body.expectedVersion)return json({error:"En nyere versjon finnes. Oppdater siden."},409);
 const saved=await s.from("rental_manual_versions").insert(input).select("id").single();
 if(saved.error){const retry=await lookup();if(!retry.error&&rentalManualMatches(retry.data,input))return json({ok:true,reused:true});return json({error:"Lagring kunne ikke bekreftes. Oppdater registeret."},503);}
 return json({ok:true,id:saved.data.id},201);
}
