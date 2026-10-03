import {NextResponse} from "next/server";
import {cronGuard} from "../../../../lib/cronAuth";
import {db} from "../../../../lib/supabase";
import {sendVippsPaymentReceiptIfNeeded} from "../../../../lib/vippsPaymentReceipt";

export const runtime="nodejs";
const LIMIT_PER_TYPE=25;

async function pendingIds(s,table){
 const {data,error}=await s.from(table)
  .select("id")
  .eq("payment_provider","vipps")
  .eq("payment_status","paid")
  .gt("payment_captured_ore",0)
  .is("receipt_sent_at",null)
  .order("updated_at",{ascending:true})
  .limit(LIMIT_PER_TYPE);
 if(error)throw error;
 return (data||[]).map(row=>row.id);
}

export async function GET(req){
 const authError=cronGuard(req); if(authError)return authError;
 const s=db();
 if(!s)return NextResponse.json({ok:false,error:"Databasen er ikke tilgjengelig."},{status:503});

 let serviceIds=[],rentalIds=[];
 try{
  [serviceIds,rentalIds]=await Promise.all([
   pendingIds(s,"orders"),
   pendingIds(s,"rental_bookings")
  ]);
 }catch(error){
  console.error("VIPPS RECEIPT RETRY QUERY ERROR",error);
  return NextResponse.json({ok:false,error:"Ventende Vipps-kvitteringer kunne ikke hentes."},{status:500});
 }

 let sent=0,skipped=0;
 const failures=[];

 for(const [unit,ids] of [["service",serviceIds],["rental",rentalIds]]){
  for(const id of ids){
   try{
    const result=await sendVippsPaymentReceiptIfNeeded({s,unit,id,req});
    if(result?.sent)sent+=1;
    else skipped+=1;
   }catch(error){
    failures.push({unit,id,error:String(error?.message||error||"Ukjent feil").slice(0,180)});
    console.error("VIPPS RECEIPT RETRY ERROR",{unit,id,message:error?.message});
   }
  }
 }

 return NextResponse.json({
  ok:true,
  checked:serviceIds.length+rentalIds.length,
  sent,
  skipped,
  failed:failures.length,
  failures
 });
}
