import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../../lib/auth";
import {db} from "../../../../../../lib/supabase";
import {vippsUnitConfig} from "../../../../../../lib/vippsConfig";
import {vippsSettlementLedgers,vippsSettlementEntries} from "../../../../../../lib/vippsClient";
import {vippsRange,matchingLedger,normalizeReportEntries,
 vippsSettlementSummary} from "../../../../../../lib/vippsSettlementReconcile";
import {storedTripletexConnection} from "../../../../../../lib/tripletexCredentials";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const headers={"Cache-Control":"private, no-store","X-Robots-Tag":"noindex,nofollow,noarchive"};
const json=(body,status=200)=>NextResponse.json(body,{status,headers});

export async function GET(req){
 const user=await getAdminUser();
 if(user?.role!=="owner")return json({error:"Bare eieren kan hente Vipps-oppgjør."},403);
 const url=new URL(req.url);
 const unit=url.searchParams.get("unit")||"service";
 if(!["service","rental"].includes(unit))return json({error:"Ukjent Vipps-salgssted."},400);
 const start=url.searchParams.get("from"),end=url.searchParams.get("to");
 const days=vippsRange(start,end,7);
 if(!days)return json({error:"Velg en gyldig periode på maksimalt 7 dager."},400);
 if(days.some(day=>day>new Date().toISOString().slice(0,10)))
  return json({error:"Kan ikke hente oppgjør for fremtidige datoer."},400);
 const config=vippsUnitConfig(unit);
 if(!config.configured)return json({error:"Vipps-nøkler er ikke konfigurert for valgt salgssted."},409);
 if(config.environment!=="production")
  return json({error:"Vipps Report API er bare tilgjengelig i produksjonsmiljø."},409);
 const s=db();if(!s)return json({error:"Database utilgjengelig."},503);
 try{
  const ledgers=await vippsSettlementLedgers(unit);
  const match=matchingLedger(ledgers,config.values.msn);
  if(!match.ok)return json({error:match.reason},409);
  const funds=[],fees=[];
  // Fetch at most two dates per batch to avoid uncontrolled provider load.
  for(let offset=0;offset<days.length;offset+=2){
   const batch=days.slice(offset,offset+2);
   const results=await Promise.all(batch.flatMap(day=>[
    vippsSettlementEntries(unit,match.ledgerId,"funds",day),
    vippsSettlementEntries(unit,match.ledgerId,"fees",day)
   ]));
   for(let i=0;i<batch.length;i++){
    funds.push(...normalizeReportEntries(results[i*2],"funds"));
    fees.push(...normalizeReportEntries(results[i*2+1],"fees"));
   }
  }
  const [local,invoiceVipps,transfers,connection]=await Promise.all([
   s.from("invoice_payments").select(
    "id,invoice_id,vipps_reference,amount_ore,reversed_at")
    .not("vipps_reference","is",null).limit(2001),
   s.from("invoice_vipps_payments").select(
    "id,invoice_id,reference,captured_ore,refunded_ore,state").limit(2001),
   s.from("tripletex_payment_transfers").select(
    "payment_id,status,amount_ore").limit(2001),
   storedTripletexConnection(s)
  ]);
  if([local,invoiceVipps,transfers].some(x=>x.error||(x.data||[]).length>2000))
   return json({error:"Kunne ikke kontrollere fullstendig lokal betalingshistorikk."},503);
  const rows=(local.data||[]).filter(x=>x.vipps_reference)
   .map(x=>({reference:x.vipps_reference,paymentId:x.id,
    amountOre:Number(x.amount_ore),reversed:!!x.reversed_at}));
  const existing=new Set(rows.map(x=>x.reference));
  for(const item of invoiceVipps.data||[]){
   if(existing.has(item.reference)||!item.reference)continue;
   if(!["paid","captured"].includes(item.state)||Number(item.refunded_ore||0)>0)continue;
   rows.push({reference:item.reference,paymentId:null,
    amountOre:Number(item.captured_ore),reversed:false});
  }
  const summary=vippsSettlementSummary(funds,fees,rows,transfers.data||[]);
  return json({
   ok:true,unit,environment:config.environment,from:start,to:end,
   ledgerMatched:true,tripletexConnected:!!connection,
   ...summary,
   postingEnabled:false,
   status:"Kontrollert mot Vipps-rapporten. Ingen regnskapsbilag er opprettet.",
   reportScope:"Kun Vipps Report API. Avstemming av bankutbetaling og oppgjørskunde i Tripletex krever egen bekreftelse."
  });
 }catch(error){
  if(error.code==="REPORT_NOT_READY")return json({error:
   "Vipps har ennå ikke ferdigstilt alle rapportene for perioden. Velg en tidligere dato."},409);
  return json({error:error.code==="REPORT_NO_ACCESS"?error.message:
   "Vipps-oppgjørene kunne ikke hentes fullstendig. Ingen bilag er opprettet. "+
   String(error?.message||"").slice(0,150)},503);
 }
}
