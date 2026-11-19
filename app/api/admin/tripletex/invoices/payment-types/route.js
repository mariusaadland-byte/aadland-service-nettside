import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../../lib/auth";
import {db} from "../../../../../../lib/supabase";
import {storedTripletexConnection,unprotectTripletexToken} from "../../../../../../lib/tripletexCredentials";
import {tripletexOpenSession,tripletexRead} from "../../../../../../lib/tripletexApi";
import {paymentTypeList} from "../../../../../../lib/tripletexPaymentSync";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(value,status=200)=>NextResponse.json(value,{status,headers});

// Read-only: fetch actual payment choices before authorizing a combined write.
// Never assume which Tripletex account is linked to bank/Vipps.
export async function GET(){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan velge Tripletex-betalingstyper."},403);
 const s=db();if(!s)return json({error:"Databasen er utilgjengelig."},503);
 try{
  const connection=await storedTripletexConnection(s);
  if(!connection)return json({error:"Tripletex må kobles til først."},409);
  const session=await tripletexOpenSession(
   unprotectTripletexToken(connection),connection.environment);
  const data=await tripletexRead("/invoice/paymentType?count=1000",
   session,connection.environment);
  if(!Array.isArray(data?.values)||data.values.length>=1000)
   return json({error:"Tripletex returnerte ikke en fullstendig liste over betalingstyper."},409);
  const types=paymentTypeList(data);
  if(!types.length)return json({error:"Ingen aktive betalingstyper funnet i Tripletex."},409);
  return json({ok:true,types,environment:connection.environment});
 }catch(error){
  return json({error:error?.name==="TripletexApiError"?error.message:
   "Kunne ikke lese betalingstyper. Ingen faktura eller betaling ble sendt."},503);
 }
}
