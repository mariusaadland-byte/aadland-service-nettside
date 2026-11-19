// Pure, conservative Vipps reconciliation. All amounts are integer øre.
// Vipps Report API does NOT confirm a completed bank payout; it reports
// scheduled transfers out of the funds ledger. Do not book automatically.
const validInt=value=>typeof value==="number"&&Number.isSafeInteger(value);
const safeSum=(items)=>items.reduce((sum,x)=>sum+x.amountOre,0);
export function norwegianDate(value){
 if(typeof value!=="string"||!/^20\d\d-\d\d-\d\d$/.test(value))return null;
 const date=new Date(value+"T00:00:00Z");
 return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value?date:null;
}
export function vippsRange(start,end,maxDays=7){
 const from=norwegianDate(start),to=norwegianDate(end);
 if(!from||!to||from>to)return null;
 const count=Math.round((to-from)/86400000)+1;
 if(count<1||count>maxDays)return null;
 return Array.from({length:count},(_,i)=>
  new Date(from.getTime()+i*86400000).toISOString().slice(0,10));
}
export function matchingLedger(ledgers,msn){
 const handle="api:"+String(msn||"").trim();
 if(!/^\d{4,20}$/.test(String(msn||"").trim())||!Array.isArray(ledgers))
  return {ok:false,reason:"Vipps-salgsstedet er ikke konfigurert."};
 const matches=ledgers.filter(x=>x?.currency==="NOK"&&
  (x.settlesForRecipientHandles||[]).includes(handle));
 if(matches.length!==1||!/^[A-Za-z0-9_-]{1,80}$/.test(String(matches[0]?.ledgerId||"")))
  return {ok:false,reason:matches.length===0?
   "Ingen oppgjørstilgang for ePayment-salgsstedet. Vippsnummer kan kreve tilgang via regnskapspartner.":
   "Flere mulige Vipps-oppgjør funnet. Kontroller salgsstedet før avstemming."};
 return {ok:true,ledgerId:String(matches[0].ledgerId)};
}
export function normalizeReportEntries(entries,topic){
 if(!Array.isArray(entries))throw Error("Vipps svarte ikke med en gyldig oppgjørsrapport.");
 return entries.map((entry,i)=>{
  const amount=entry?.amount;
  if(!validInt(amount)||!Number.isSafeInteger(amount)||entry.currency!=="NOK"||
   typeof entry.entryType!=="string"||!/^\d{4}-\d\d-\d\d$/.test(entry.ledgerDate||""))
   throw Error("Vipps-oppgjøret inneholder en post med ugyldig beløp, dato eller valuta.");
  return {
   topic,type:entry.entryType,
   amountOre:amount,date:entry.ledgerDate,
   reference:String(entry.reference||"").slice(0,100),
   pspReference:String(entry.pspReference||"").slice(0,120),
   row:i
  };
 });
}
export function vippsSettlementSummary(funds,fees,localPayments=[],tripletexTransfers=[]){
 const validFunds=new Set(["capture","refund","fees-retained","payout-scheduled",
  "payout-aborted","retained-disputed-capture","returned-disputed-capture",
  "correction","top-up","credit-note"]);
 const validFees=new Set(["capture-fee","fees-retained","fees-invoiced","correction","credit-note"]);
 const unknown=funds.filter(x=>!validFunds.has(x.type)).length+
  fees.filter(x=>!validFees.has(x.type)).length;
 const byType=(entries,type)=>entries.filter(x=>x.type===type);
 const captures=byType(funds,"capture"),refunds=byType(funds,"refund"),
  feesRetained=byType(funds,"fees-retained"),
  scheduled=byType(funds,"payout-scheduled"),
  aborted=byType(funds,"payout-aborted"),
  feesCaptured=byType(fees,"capture-fee");
 if(![...funds,...fees].every(x=>validInt(x.amountOre)))
  throw Error("Ugyldig Vipps-beløp i rapport.");
 if(captures.some(x=>x.amountOre<=0)||refunds.some(x=>x.amountOre>=0)||
  scheduled.some(x=>x.amountOre>=0))
  throw Error("Vipps-rapporten inneholder uventet fortegn. Manuell kontroll kreves.");
 const byReference=new Map();
 for(const x of captures){
  if(!x.reference)continue;
  const arr=byReference.get(x.reference)||[];
  arr.push(x);byReference.set(x.reference,arr);
 }
 const transfers=new Map(tripletexTransfers.filter(x=>x.status==="confirmed")
  .map(x=>[x.payment_id,Number(x.amount_ore)]));
 const localByRef=new Map();
 for(const payment of localPayments){
  if(!payment.reference)continue;
  const arr=localByRef.get(payment.reference)||[];
  arr.push(payment);localByRef.set(payment.reference,arr);
 }
 const matching=[];
 for(const [reference,entries] of byReference){
  const local=localByRef.get(reference)||[];
  const capturedOre=safeSum(entries);
  const candidates=local.filter(x=>!x.reversed&&
   validInt(x.amountOre)&&x.amountOre===capturedOre);
  let status="ingen-sikker-kobling";
  if(candidates.length===1)status=candidates[0].paymentId&&
   (transfers.get(candidates[0].paymentId)===capturedOre)?"tripletex-bekreftet":
   "funnet-i-aadland";
  if(candidates.length>1)status="flere-mulige-betalinger";
  matching.push({reference,capturedOre,count:entries.length,status});
 }
 const payoutRows=scheduled.map(x=>({date:x.date,
  amountOre:-x.amountOre,reference:x.reference,
  note:"Planlagt utbetaling – ikke bekreftet bankinnskudd"}));
 return {
  totals:{
   capturesOre:safeSum(captures),
   refundsOre:safeSum(refunds),
   retainedFeesOre:safeSum(feesRetained),
   feesChargedOre:safeSum(feesCaptured),
   payoutScheduledOre:payoutRows.reduce((n,x)=>n+x.amountOre,0),
   payoutAbortedOre:safeSum(aborted),
   numberOfCaptures:captures.length,
   numberOfRefunds:refunds.length,
   numberOfFees:feesCaptured.length,
   numberOfPayouts:payoutRows.length
  },
  payoutRows,
  matching:matching.sort((a,b)=>a.reference.localeCompare(b.reference)).slice(0,250),
  unreferencedCaptures:captures.filter(x=>!x.reference).length,
  unknownEntryTypes:unknown,
  warning:"Vipps viser planlagte utbetalinger, ikke bekreftede bankinnskudd. "+
   "Gebyrer, refusjoner, bankinnskudd og åpne poster i Tripletex må kontrolleres før bilagsføring."
 };
}
