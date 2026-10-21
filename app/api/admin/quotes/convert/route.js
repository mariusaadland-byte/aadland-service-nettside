import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {NextResponse} from "next/server";
import crypto from "crypto";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";

function orderNumber(){
 return "AS-"+Date.now().toString().slice(-8)+"-"+crypto.randomBytes(2).toString("hex").toUpperCase();
}

export async function POST(req){
 const originError=sameOriginGuard(req);if(originError)return originError;
 const user=await getAdminUser();
 if(!user||!(user.role==="owner"||user.canUpdateOrders))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const body=await req.json().catch(()=>null);
 const id=String(body?.id||"").trim();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({error:"Velg et gyldig tilbud."},{status:400});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 // The quote lock, order insert and link update share a database transaction.
 const {data,error}=await s.rpc("create_accepted_quote_order",{p_quote_id:id,p_order_number:orderNumber()});
 if(error){
  if(error.code==="P0002")return NextResponse.json({error:"Tilbudet ble ikke funnet."},{status:404});
  if(error.code==="22023")return NextResponse.json({error:"Bare godkjente tilbud kan gjøres om til oppdrag."},{status:409});
  if(error.code==="42883")return NextResponse.json({error:"Databaseoppdateringen for oppretting av oppdrag mangler.",setupRequired:true},{status:503});
  console.error("QUOTE ORDER CREATE",error.code);
  return NextResponse.json({error:"Oppdraget kunne ikke opprettes. Prøv igjen."},{status:500});
 }
 if(!data?.orderId)return NextResponse.json({error:"Oppdraget kunne ikke bekreftes. Last inn tilbudet igjen."},{status:500});
 if(data.alreadyExists)return NextResponse.json({error:"Det er allerede opprettet et oppdrag fra dette tilbudet.",orderId:data.orderId},{status:409});
 return NextResponse.json({ok:true,orderId:data.orderId,orderNumber:data.orderNumber});
}
