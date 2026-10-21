import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {isValidDateInput} from "../../../../../lib/osloTime";
const allowed=user=>user&&(user.role==="owner"||user.canUpdateOrders||user.canManageProducts);
const fail=(error,status=400)=>NextResponse.json({error},{status});
const uuid=value=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function GET(req){
 if(!allowed(await getAdminUser()))return fail("Ingen tilgang.",403);
 const invoiceId=new URL(req.url).searchParams.get("invoiceId");if(!uuid(invoiceId))return fail("Velg en faktura.");
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 const {data,error}=await s.from("invoice_payments").select("id,invoice_id,amount_ore,paid_on,note,recorded_at,reversed_at,vipps_reference").eq("invoice_id",invoiceId).order("recorded_at",{ascending:false});
 if(error)return fail("Betalingshistorikken kunne ikke hentes.",500);
 return NextResponse.json({payments:data});
}
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();if(!allowed(user))return fail("Ingen tilgang.",403);
 const b=await req.json().catch(()=>({}));
 if(!uuid(b.invoiceId)||!uuid(b.requestId)||!isValidDateInput(b.paidOn))return fail("Kontroller faktura og betalingsdato.");
 const amount=b.amountOre==null?null:b.amountOre;
 if(amount!==null&&(!Number.isSafeInteger(amount)||amount<=0))return fail("Oppgi et gyldig innbetalt beløp.");
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 const {data,error}=await s.rpc("record_invoice_payment",{p_invoice_id:b.invoiceId,p_amount_ore:amount,p_paid_on:b.paidOn,p_request_id:b.requestId,p_admin_id:user.id,p_note:String(b.note||"").trim().slice(0,500)});
 if(error)return fail(error.message||"Betalingen kunne ikke registreres.");
 return NextResponse.json({ok:true,...data});
}
export async function PATCH(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();if(!allowed(user))return fail("Ingen tilgang.",403);
 const b=await req.json().catch(()=>({}));if(!uuid(b.paymentId))return fail("Velg en betalingsregistrering.");
 const s=db();if(!s)return fail("Database utilgjengelig.",503);
 const {data,error}=await s.rpc("reverse_invoice_payment",{p_payment_id:b.paymentId,p_admin_id:user.id});
 if(error)return fail(error.message||"Registreringen kunne ikke angres.");
 return NextResponse.json({ok:true,...data});
}
