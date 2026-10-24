import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
export const runtime="nodejs";
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const allowed=u=>u&&(u.role==="owner"||u.canUpdateOrders||u.canManageProducts);
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(req){
 const user=await getAdminUser();if(!allowed(user))return reply({error:"Ingen tilgang."},403);
 const invoiceId=new URL(req.url).searchParams.get("invoiceId");
 if(!uuid(invoiceId))return reply({error:"Velg en gyldig faktura."},400);
 const s=db();if(!s)return reply({error:"Databasen er utilgjengelig."},503);
 const [state,history]=await Promise.all([
  s.from("invoice_admin_closures").select("invoice_id,closed_at,close_note,last_changed_at,revision")
   .eq("invoice_id",invoiceId).maybeSingle(),
  s.from("invoice_admin_closure_events")
   .select("id,action,note,happened_at,paid_ore,credited_ore,outstanding_ore")
   .eq("invoice_id",invoiceId).order("happened_at",{ascending:false}).limit(100)
 ]);
 if(state.error||history.error||!Array.isArray(history.data))
  return reply({error:"Historikken for avslutning kunne ikke hentes."},503);
 return reply({canManage:user.role==="owner",closure:state.data||null,events:history.data});
}
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();if(user?.role!=="owner")
  return reply({error:"Bare eieren kan avslutte eller åpne en faktura."},403);
 if(process.env.VERCEL_ENV==="preview")
  return reply({error:"Fakturaer kan bare avsluttes på produksjonssiden."},403);
 const body=await req.json().catch(()=>({}));
 if(!uuid(body.invoiceId)||!uuid(body.requestId)||!["close","reopen"].includes(body.action)||
   typeof body.note!=="string"||body.note.trim().length<5||body.note.trim().length>500||
   !Number.isSafeInteger(body.expectedPaidOre)||body.expectedPaidOre<0||
   !Number.isSafeInteger(body.expectedCreditedOre)||body.expectedCreditedOre<0||
   !Number.isSafeInteger(body.expectedOutstandingOre)||body.expectedOutstandingOre<0||
   body.confirmed!==true)
  return reply({error:"Kontroller faktura, beløp, begrunnelse og bekreftelse."},400);
 const s=db();if(!s)return reply({error:"Databasen er utilgjengelig."},503);
 const result=await s.rpc("set_invoice_admin_closure",{
  p_invoice_id:body.invoiceId,p_request_id:body.requestId,
  p_action:body.action,p_reason:body.note.trim(),
  p_expected_paid_ore:body.expectedPaidOre,
  p_expected_credited_ore:body.expectedCreditedOre,
  p_expected_outstanding_ore:body.expectedOutstandingOre,p_actor_id:user.id
 });
 if(result.error)return reply({error:result.error.message||"Avslutningen kunne ikke registreres."},409);
 return reply({ok:true,...result.data});
}
