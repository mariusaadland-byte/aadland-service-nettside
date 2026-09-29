import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {isValidDateInput,osloDateKey} from "../../../../../lib/osloTime";

async function allowed(){
 const user=await getAdminUser();
 if(!user)return null;
 return (user.role==="owner"||user.canUpdateOrders)?user:null;
}

export async function POST(req){
 const originError=sameOriginGuard(req); if(originError)return originError;
 const user=await allowed();
 if(!user)return NextResponse.json({error:"Ingen tilgang."},{status:403});

 const body=await req.json().catch(()=>({}));
 const id=String(body.id||"").trim();
 const signedDate=String(body.signedDate||"").trim();
 if(!id)return NextResponse.json({error:"Tilbud mangler."},{status:400});
 if(!signedDate||!isValidDateInput(signedDate))return NextResponse.json({error:"Velg datoen kunden signerte tilbudet."},{status:400});

 const today=osloDateKey(new Date());
 if(signedDate>today)return NextResponse.json({error:"Signeringsdato kan ikke være i fremtiden."},{status:400});

 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data:quote,error}=await s.from("quotes").select("*").eq("id",id).maybeSingle();
 if(error||!quote)return NextResponse.json({error:"Tilbudet ble ikke funnet."},{status:404});
 if(quote.status!=="sent")return NextResponse.json({error:"Bare et aktivt, utlevert tilbud kan registreres som godkjent på papir."},{status:409});
 if(quote.valid_until&&signedDate>quote.valid_until){
  return NextResponse.json({error:"Signeringsdatoen er etter tilbudets gyldighetsdato. Opprett en revisjon eller kontroller datoen."},{status:409});
 }

 const now=new Date().toISOString();
 const {data:updated,error:updateError}=await s.from("quotes").update({
  status:"accepted",
  accepted_at:now,
  declined_at:null,
  acceptance_method:"paper",
  paper_signed_date:signedDate,
  accepted_recorded_by:user.id,
  auto_follow_up:false,
  updated_at:now
 }).eq("id",id).eq("status","sent").select("*").maybeSingle();

 if(updateError){
  console.error("QUOTE PAPER ACCEPT",updateError);
  return NextResponse.json({error:"Papirgodkjenningen kunne ikke lagres."},{status:500});
 }
 if(!updated)return NextResponse.json({error:"Tilbudet er ikke lenger aktivt og kunne ikke godkjennes på papir."},{status:409});

 return NextResponse.json({
  ok:true,
  acceptedAt:updated.accepted_at,
  acceptanceMethod:updated.acceptance_method,
  paperSignedDate:updated.paper_signed_date
 });
}
