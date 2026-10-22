import {NextResponse} from "next/server";
import {cronGuard} from "../../../../lib/cronAuth";
import {reconcileInvoiceVipps} from "../../../../lib/invoiceVipps";
import {db} from "../../../../lib/supabase";
import {sendVippsPaymentReceiptIfNeeded} from "../../../../lib/vippsPaymentReceipt";
import {sendVippsRefundNoticeIfNeeded} from "../../../../lib/vippsRefundNotice";
import {sendPaidRentalConfirmationIfNeeded} from "../../../../lib/rentalConfirmationEmail";

export const runtime="nodejs";
export const maxDuration=60;
const LIMIT_PER_TYPE=25;
const SETTLEMENT_RECHECK_DAYS=180;

async function pendingReceiptIds(s,table){
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

async function pendingRefundIds(s,table){
 const {data,error}=await s.from(table)
  .select("id,payment_refunded_ore,refund_notice_total_ore")
  .eq("payment_provider","vipps")
  .gt("payment_refunded_ore",0)
  .order("updated_at",{ascending:true})
  .limit(LIMIT_PER_TYPE*2);
 if(error)throw error;
 return (data||[])
  .filter(row=>Math.max(0,Number(row.payment_refunded_ore)||0)>Math.max(0,Number(row.refund_notice_total_ore)||0))
  .slice(0,LIMIT_PER_TYPE)
  .map(row=>row.id);
}

async function pendingRentalConfirmationIds(s){
 const {data,error}=await s.from("rental_bookings")
  .select("id")
  .eq("payment_provider","vipps")
  .eq("payment_status","paid")
  .gt("payment_captured_ore",0)
  .is("confirmation_sent_at",null)
  .neq("status","cancelled")
  .order("updated_at",{ascending:true})
  .limit(LIMIT_PER_TYPE);
 if(error)throw error;
 return (data||[]).map(row=>row.id);
}

export async function GET(req){
 const authError=cronGuard(req); if(authError)return authError;
 const s=db();
 if(!s)return NextResponse.json({ok:false,error:"Databasen er ikke tilgjengelig."},{status:503});

 let serviceIds=[],rentalIds=[],rentalConfirmationIds=[],serviceRefundIds=[],rentalRefundIds=[];
 try{
  [serviceIds,rentalIds,rentalConfirmationIds,serviceRefundIds,rentalRefundIds]=await Promise.all([
   pendingReceiptIds(s,"orders"),
   pendingReceiptIds(s,"rental_bookings"),
   pendingRentalConfirmationIds(s),
   pendingRefundIds(s,"orders"),
   pendingRefundIds(s,"rental_bookings")
  ]);
 }catch(error){
  console.error("VIPPS RECEIPT RETRY QUERY ERROR",error);
  return NextResponse.json({ok:false,error:"Ventende Vipps-kvitteringer kunne ikke hentes."},{status:500});
 }

 let sent=0,skipped=0,confirmationSent=0,confirmationSkipped=0,refundSent=0,refundSkipped=0;
 const failures=[];

 for(const [unit,ids] of [["service",serviceIds],["rental",rentalIds]]){
  for(const id of ids){
   try{
    const result=await sendVippsPaymentReceiptIfNeeded({s,unit,id,req});
    if(result?.sent)sent+=1;
    else skipped+=1;
   }catch(error){
    failures.push({type:"receipt",unit,id,error:String(error?.message||error||"Ukjent feil").slice(0,180)});
    console.error("VIPPS RECEIPT RETRY ERROR",{unit,id,message:error?.message});
   }
  }
 }

 for(const id of rentalConfirmationIds){
  try{
   const result=await sendPaidRentalConfirmationIfNeeded({s,id,req});
   if(result?.sent)confirmationSent+=1;
   else confirmationSkipped+=1;
  }catch(error){
   failures.push({type:"rental-confirmation",unit:"rental",id,error:String(error?.message||error||"Ukjent feil").slice(0,180)});
   console.error("VIPPS RENTAL CONFIRMATION RETRY ERROR",{id,message:error?.message});
  }
 }

 for(const [unit,ids] of [["service",serviceRefundIds],["rental",rentalRefundIds]]){
  for(const id of ids){
   try{
    const result=await sendVippsRefundNoticeIfNeeded({s,unit,id,req});
    if(result?.sent)refundSent+=1;
    else refundSkipped+=1;
   }catch(error){
    failures.push({type:"refund",unit,id,error:String(error?.message||error||"Ukjent feil").slice(0,180)});
    console.error("VIPPS REFUND NOTICE RETRY ERROR",{unit,id,message:error?.message});
   }
  }
 }

 // Recover missed callbacks and retry frozen receipts. Also recheck recently
 // settled payments: a refund can occur AFTER a paid receipt was already sent,
 // and a delayed/missed webhook must not leave the invoice incorrectly marked paid.
 // Sort oldest last-checked first. sync_invoice_vipps updates updated_at on each
 // successful provider check, rotating the bounded batch fairly across days.
 const settledSince=new Date(Date.now()-SETTLEMENT_RECHECK_DAYS*86400000).toISOString();
 const [invoiceRows,settledRows]=await Promise.all([
  s.from("invoice_vipps_payments").select("reference,state,captured_ore,refunded_ore")
   .or("state.in.(pending,authorized),and(captured_ore.gt.0,receipt_sent_at.is.null,refunded_ore.eq.0)")
   .order("updated_at",{ascending:true}).limit(LIMIT_PER_TYPE),
  s.from("invoice_vipps_payments").select("reference,state,captured_ore,refunded_ore")
   .in("state",["paid","partial","refunded","cancelled"])
   .gte("created_at",settledSince)
   .order("updated_at",{ascending:true}).limit(LIMIT_PER_TYPE)
 ]);
 if(invoiceRows.error)failures.push({type:"invoice-query",error:"Ventende fakturaer kunne ikke hentes."});
 if(settledRows.error)failures.push({type:"invoice-settled-query",error:"Tidligere fullførte fakturabetalinger kunne ikke kontrolleres."});
 // A record may appear in both queries (e.g. a captured payment awaiting its
 // receipt). Process it just once to avoid extra provider calls/receipt retries.
 const references=new Map();
 for(const row of invoiceRows.data||[])if(row.reference)references.set(row.reference,{...row,checkSource:"pending"});
 for(const row of settledRows.data||[])if(row.reference&&!references.has(row.reference))references.set(row.reference,{...row,checkSource:"settled"});
 let invoiceChecked=0,invoicePaid=0,invoiceReceiptSent=0,invoiceReceiptPending=0;
 let settledChecked=0,settlementChanges=0,refundsDetected=0;
 for(const row of references.values()){
  invoiceChecked++;
  try{
   const result=await reconcileInvoiceVipps(s,row.reference);
   if(row.checkSource==="settled"){
    settledChecked++;
    if(Number(result.captured_ore)!==Number(row.captured_ore)||Number(result.refunded_ore)!==Number(row.refunded_ore))settlementChanges++;
    if(Number(result.refunded_ore)>Number(row.refunded_ore))refundsDetected++;
   }
   if(result.state==="paid"||result.state==="partial")invoicePaid++;
   if(result.receipt_sent_at)invoiceReceiptSent++;
   else if(Number(result.captured_ore)>Number(result.refunded_ore)&&Number(result.captured_ore)>0){
    invoiceReceiptPending++;
    if(result.receipt_error)failures.push({type:"invoice-receipt",reference:row.reference,error:String(result.receipt_error).slice(0,180)});
   }
  }catch(e){failures.push({type:"invoice",reference:row.reference,error:String(e.message).slice(0,180)});}
 }
 if(failures.length)console.error("VIPPS RECEIPT RECOVERY INCOMPLETE",{failed:failures.length,types:failures.map(f=>f.type)});
 return NextResponse.json({
  ok:failures.length===0,
  checked:serviceIds.length+rentalIds.length+rentalConfirmationIds.length+serviceRefundIds.length+rentalRefundIds.length+invoiceChecked,
  receipt:{checked:serviceIds.length+rentalIds.length,sent,skipped},
  rentalConfirmation:{checked:rentalConfirmationIds.length,sent:confirmationSent,skipped:confirmationSkipped},
  refund:{checked:serviceRefundIds.length+rentalRefundIds.length,sent:refundSent,skipped:refundSkipped},
  invoice:{checked:invoiceChecked,paidOrPartial:invoicePaid,receiptConfirmed:invoiceReceiptSent,receiptPending:invoiceReceiptPending,settledRechecked:settledChecked,settlementChanges,refundsDetected},
  failed:failures.length,
  failures
 },{status:failures.length?503:200});
}
