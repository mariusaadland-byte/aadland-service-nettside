import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {db} from "../../../../../lib/supabase";
import {rentalUnitInput} from "../../../../../lib/rentalUnitQr.mjs";
export const runtime="nodejs";
const json=(b,status=200)=>NextResponse.json(b,{status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
export async function POST(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(!user||!(user.role==="owner"||user.canManageProducts))return json({error:"Ingen tilgang."},403);
 if(process.env.VERCEL_ENV!=="production"||process.env.RENTAL_UNIT_REGISTER_ENABLED!=="true")return json({error:"Individregisteret er ikke aktivert."},503);
 const input=rentalUnitInput(await req.json().catch(()=>null));if(!input)return json({error:"Ugyldig produkt eller serienummer."},400);
 const s=db();if(!s)return json({error:"Database utilgjengelig."},503);
 const {data:item,error:itemError}=await s.from("rental_items").select("id").eq("id",input.rental_item_id).maybeSingle();
 if(itemError||!item)return json({error:"Produktet kunne ikke bekreftes."},409);
 const {data:unit,error}=await s.from("rental_equipment_units").insert({...input,created_by:user.id}).select("id,rental_item_id,serial_number").single();
 if(error?.code==="23505"){
  const {data:previous,error:lookup}=await s.from("rental_equipment_units").select("id,rental_item_id,serial_number").eq("id",input.id).maybeSingle();
  if(!lookup&&previous&&previous.rental_item_id===input.rental_item_id&&previous.serial_number===input.serial_number)return json({ok:true,id:previous.id,reused:true});
  return json({error:"Enheten eller serienummeret finnes allerede, eller referansen er i konflikt."},409);
 }
 if(error||!unit)return json({error:"Enheten kunne ikke registreres. Oppdater registeret før nytt forsøk."},503);
 return json({ok:true,id:unit.id});
}
