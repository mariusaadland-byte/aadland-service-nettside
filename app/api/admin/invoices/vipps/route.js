import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {startInvoiceVipps,reconcileInvoiceVipps,invoiceVippsView} from "../../../../../lib/invoiceVipps";
export const runtime="nodejs";
export const maxDuration=60;
const allowed=u=>u&&(u.role==="owner"||u.canUpdateOrders||u.canManageProducts);
const uuid=v=>typeof v==="string"&&/^[0-9a-f-]{36}$/i.test(v);
export async function GET(req){
 if(!allowed(await getAdminUser()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const id=new URL(req.url).searchParams.get("id");if(!uuid(id))return NextResponse.json({error:"Velg en faktura."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Database utilgjengelig."},{status:503});
 const r=await s.from("invoice_vipps_payments").select("*").eq("invoice_id",id).order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(r.error)return NextResponse.json({error:"Vipps-status kunne ikke hentes."},{status:500});
 return NextResponse.json({payment:invoiceVippsView(r.data)},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(req){
 const guard=sameOriginGuard(req);if(guard)return guard;
 if(!allowed(await getAdminUser()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const b=await req.json().catch(()=>({}));
 if(!uuid(b.id)||!["start","sync"].includes(b.action))return NextResponse.json({error:"Ugyldig handling."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Database utilgjengelig."},{status:503});
 const found=await s.from("invoice_drafts").select("*").eq("id",b.id).maybeSingle();
 if(found.error||!found.data)return NextResponse.json({error:"Fakturaen ble ikke funnet."},{status:404});
 try{
  let p;
  if(b.action==="start"){
   if(b.workCompleted!==true)return NextResponse.json({error:"Bekreft at arbeidet er ferdig før direkte betaling."},{status:400});
   p=await startInvoiceVipps(s,found.data);
  }else{
   const latest=await s.from("invoice_vipps_payments").select("reference").eq("invoice_id",b.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
   if(latest.error||!latest.data)throw Error("Ingen Vipps-betaling er startet.");
   p=await reconcileInvoiceVipps(s,latest.data.reference);
  }
  return NextResponse.json({ok:true,payment:invoiceVippsView(p)},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){console.error("INVOICE VIPPS",{id:b.id,message:e.message});return NextResponse.json({error:e.message||"Vipps-betalingen kunne ikke behandles. Prøv samme knapp igjen."},{status:409});}
}
