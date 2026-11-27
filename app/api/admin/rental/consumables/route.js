import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {db} from "../../../../../lib/supabase";
import {rentalUnitId} from "../../../../../lib/rentalUnitQr.mjs";
import {consumableAdminInput,stockAdjustmentInput,revisionInput} from "../../../../../lib/rentalConsumableAdmin.mjs";
export const runtime="nodejs";
const json=(b,status=200)=>NextResponse.json(b,{status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
export async function POST(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const u=await getAdminUser();if(u?.role!=="owner")return json({error:"Ingen tilgang."},403);
 if(process.env.VERCEL_ENV!=="production"||process.env.RENTAL_CONSUMABLE_ADMIN_ENABLED!=="true")return json({error:"Vareadministrasjon er ikke aktivert."},503);
 const b=await req.json().catch(()=>null),s=db();if(!s)return json({error:"Database utilgjengelig."},503);
 if(b?.action==="adjust"){
  const x=stockAdjustmentInput(b);if(!x)return json({error:"Ugyldig lagerjustering."},400);
  const r=await s.rpc("adjust_rental_consumable_stock",{p_id:x.id,p_request:x.requestId,p_actor:u.id,p_revision:x.revision,p_delta:x.delta,p_reason:x.reason,p_note:x.note});
  if(r.error)return json({error:"Lagerjusteringen kunne ikke bekreftes. Kontroller historikk og oppdater før nytt forsøk."},409);
  return json({ok:true,quantity:r.data});
 }
 if(!["create","edit"].includes(b?.action))return json({error:"Ugyldig handling."},400);
 const x=consumableAdminInput(b);if(!x||!rentalUnitId(b.id))return json({error:"Kontroller varenavn, nummer, priser og maskin."},400);
 const id=b.id.toLowerCase();
 const item=await s.from("rental_items").select("id").eq("id",x.rental_item_id).maybeSingle();
 if(item.error||!item.data)return json({error:"Maskinen kunne ikke bekreftes."},409);
 if(b.action==="create"){
  const r=await s.from("rental_consumables").insert({...x,id}).select("id").single();
  if(r.error||!r.data)return json({error:"Varen kunne ikke bekreftes. Kontroller registeret før nytt forsøk."},409);
  return json({ok:true,id});
 }
 if(!revisionInput(b.revision))return json({error:"Oppdater varen før redigering."},400);
 const r=await s.from("rental_consumables").update({...x,revision:b.revision+1}).eq("id",id).eq("revision",b.revision).select("id").maybeSingle();
 if(r.error||!r.data)return json({error:"Varen er endret eller varenummeret er i bruk. Oppdater registeret."},409);
 return json({ok:true,id});
}
