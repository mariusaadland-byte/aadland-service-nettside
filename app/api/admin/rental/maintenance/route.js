import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {db} from "../../../../../lib/supabase";
import {osloDateKey} from "../../../../../lib/osloTime";
import {rentalUnitId} from "../../../../../lib/rentalUnitQr.mjs";
import {maintenanceInput,sameMaintenanceEvent} from "../../../../../lib/rentalUnitMaintenance.mjs";
export const runtime="nodejs";
const json=(b,status=200)=>NextResponse.json(b,{status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie"}});
const enabled=()=>process.env.VERCEL_ENV==="production"&&process.env.RENTAL_UNIT_REGISTER_ENABLED==="true"&&process.env.RENTAL_UNIT_MAINTENANCE_ENABLED==="true";
const fields="id,unit_id,kind,condition,performed_on,next_due_on,note,created_at";
async function context(id){
 if(!rentalUnitId(id))return {response:json({error:"Ugyldig enhet."},400)};
 const s=db();if(!s)return {response:json({error:"Database utilgjengelig."},503)};
 const {data,error}=await s.from("rental_equipment_units").select("id").eq("id",id).maybeSingle();
 if(error||!data)return {response:json({error:"Enheten kunne ikke bekreftes."},404)};
 return {s};
}
export async function GET(req){
 const user=await getAdminUser();if(!user||!(user.role==="owner"||user.canManageProducts||user.canViewOrders))return json({error:"Ingen tilgang."},403);
 if(!enabled())return json({error:"Servicehistorikk er ikke aktivert.",disabled:true},503);
 const id=new URL(req.url).searchParams.get("unitId"),c=await context(id);if(c.response)return c.response;
 const {data,error,count}=await c.s.from("rental_unit_maintenance_events").select(fields,{count:"exact"}).eq("unit_id",id).order("performed_on",{ascending:false}).order("created_at",{ascending:false}).order("id",{ascending:false}).limit(100);
 if(error)return json({error:"Servicehistorikken kunne ikke hentes."},503);
 return json({events:data||[],limited:count>(data||[]).length,today:osloDateKey(new Date())});
}
export async function POST(req){
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(!user||!(user.role==="owner"||user.canManageProducts))return json({error:"Ingen tilgang."},403);
 if(!enabled())return json({error:"Servicehistorikk er ikke aktivert."},503);
 const input=maintenanceInput(await req.json().catch(()=>null),osloDateKey(new Date()));if(!input)return json({error:"Kontroller dato, type, tilstand og beskrivelse."},400);
 const c=await context(input.unit_id);if(c.response)return c.response;
 const {data,error}=await c.s.from("rental_unit_maintenance_events").insert({...input,created_by:user.id}).select(fields).single();
 if(error?.code==="23505"){
  const previous=await c.s.from("rental_unit_maintenance_events").select(fields).eq("id",input.id).maybeSingle();
  if(!previous.error&&sameMaintenanceEvent(previous.data,input))return json({ok:true,reused:true});
  return json({error:"Registreringen er i konflikt. Oppdater historikken."},409);
 }
 if(error||!data)return json({error:"Registreringen kunne ikke bekreftes. Oppdater historikken før nytt forsøk."},503);
 return json({ok:true});
}
