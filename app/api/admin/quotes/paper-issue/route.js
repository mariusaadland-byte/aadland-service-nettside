import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {osloDateKey} from "../../../../../lib/osloTime";

async function allowed(){
 const user=await getAdminUser();
 if(!user)return null;
 return (user.role==="owner"||user.canUpdateOrders||user.canManageProducts)?user:null;
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});

 const {id}=await req.json().catch(()=>({}));
 if(!id)return NextResponse.json({error:"Tilbud mangler."},{status:400});

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data:quote,error}=await s.from("quotes").select("*").eq("id",id).maybeSingle();
 if(error||!quote)return NextResponse.json({error:"Tilbudet ble ikke funnet."},{status:404});
 if(!["draft","sent"].includes(quote.status)){
  return NextResponse.json({error:"Denne tilbudsversjonen kan ikke registreres som utlevert på papir."},{status:409});
 }

 const today=osloDateKey(new Date());
 if(quote.valid_until&&quote.valid_until<today){
  return NextResponse.json({error:"Tilbudet har passert gyldighetsdatoen. Opprett en revisjon før det leveres ut."},{status:409});
 }

 const now=new Date().toISOString();
 if(quote.status==="draft"){
  const {error:activationError}=await s.rpc("activate_quote_revision",{p_quote_id:id,p_sent_at:now});
  if(activationError){
   console.error("QUOTE PAPER ACTIVATE",activationError);
   return NextResponse.json({error:"Tilbudet kunne ikke registreres som utlevert. Kontroller om en tidligere revisjon er ferdigbehandlet."},{status:409});
  }
 }

 const {data:updated,error:updateError}=await s.from("quotes").update({
  issued_via:quote.issued_via||"paper",
  paper_issued_at:now,
  updated_at:now
 }).eq("id",id).select("id,status,sent_at,issued_via,paper_issued_at").single();

 if(updateError){
  console.error("QUOTE PAPER ISSUE",updateError);
  return NextResponse.json({error:"Papirutleveringen kunne ikke registreres."},{status:500});
 }

 return NextResponse.json({
  ok:true,
  status:updated.status,
  sentAt:updated.sent_at||now,
  issuedVia:updated.issued_via||"paper",
  paperIssuedAt:updated.paper_issued_at||now
 });
}
