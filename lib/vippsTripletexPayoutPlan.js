// Pure bookkeeping preflight. No money may be booked from a summarized
// month/year report: payout windows must be freshly fetched from Vipps and
// every capture must match an already confirmed Tripletex invoice payment.
const int=x=>typeof x==="number"&&Number.isSafeInteger(x);
const dateOk=d=>typeof d==="string"&&/^20\d\d-\d\d-\d\d$/.test(d)&&
 Number.isFinite(Date.parse(d+"T00:00:00Z"))&&
 new Date(d+"T00:00:00Z").toISOString().slice(0,10)===d;
export function payoutTripletexMarker(unit,id){
 if(!["service","rental"].includes(unit)||typeof id!=="string"||
  !/^[A-Za-z0-9_-]{4,100}$/.test(id))throw Error("Ukjent Vipps-utbetaling.");
 // Encodes the complete provider ID, without collisions from truncating it.
 const marker="ASVP-"+unit+"-"+id;
 if(marker.length>125)throw Error("Vipps-utbetalingsnummeret er for langt.");
 return marker;
}
export function vippsPayoutPlan(funds,payoutId,payoutDate,local=[],transfers=[]){
 if(!Array.isArray(funds)||!Array.isArray(local)||!Array.isArray(transfers)||
  typeof payoutId!=="string"||!dateOk(payoutDate))
  throw Error("Ugyldig eller ufullstendig Vipps-grunnlag.");
 const candidates=funds.map((x,i)=>({...x,i}))
  .filter(x=>x.type==="payout-scheduled"&&x.pspReference===payoutId&&x.date===payoutDate);
 if(candidates.length!==1)throw Error("Fant ikke nøyaktig én utbetaling i Vipps.");
 const targetIndex=candidates[0].i,payout=candidates[0];
 const allowed=new Set(["capture","fees-retained","payout-scheduled"]);
 // The source ledger must be ordered and balance-continuous, not inferred
 // from daily sums or a bank transfer that may include earlier deposits.
 let first=0;
 for(let j=targetIndex-1;j>=0;j--){
  if(funds[j].type==="payout-scheduled"){
   first=j+1;
   if(funds[j].balanceAfter!==0)
    throw Error("Tidligere Vipps-oppgjør har restsaldo. Avstemming krever manuell kontroll.");
   break;
  }
  if(funds[j].type==="payout-aborted")
   throw Error("Oppgjøret inneholder avbrutt utbetaling.");
 }
 const group=funds.slice(first,targetIndex+1);
 if(!group.length||group.length>1000)
  throw Error("Oppgjøret er ufullstendig eller for stort for automatisk bokføring.");
 for(let i=0;i<group.length;i++){
  const x=group[i];
  if(!allowed.has(x.type)||!int(x.amountOre)||!int(x.balanceBefore)||
   !int(x.balanceAfter)||x.balanceBefore+x.amountOre!==x.balanceAfter||
   !dateOk(x.date)||x.date>payoutDate)
   throw Error("Vipps-oppgjøret inneholder avvik eller posttyper som må kontrolleres manuelt.");
  if(i>0&&group[i-1].balanceAfter!==x.balanceBefore)
   throw Error("Det mangler Vipps-posteringer mellom betalingene i oppgjøret.");
 }
 if(group[0].balanceBefore!==0||payout.balanceAfter!==0)
  throw Error("Vipps-saldoen er ikke null ved start og slutt. Avstem manuelt.");
 if(group.at(-1).type!=="payout-scheduled"||payout.amountOre>=0)
  throw Error("Uventet Vipps-utbetalingsbeløp.");
 const captures=group.filter(x=>x.type==="capture");
 const retained=group.filter(x=>x.type==="fees-retained");
 if(!captures.length||captures.some(x=>x.amountOre<=0||!x.reference))
  throw Error("Oppgjøret mangler fakturabetalinger med Vipps-referanse.");
 if(retained.some(x=>x.amountOre>0))
  throw Error("Vipps-gebyrkorrigering trenger manuell avstemming.");
 const grossOre=captures.reduce((n,x)=>n+x.amountOre,0);
 const feeOre=-retained.reduce((n,x)=>n+x.amountOre,0);
 const payoutOre=-payout.amountOre;
 if(![grossOre,feeOre,payoutOre].every(int)||grossOre<=0||payoutOre<=0||
  grossOre!==payoutOre+feeOre)
  throw Error("Vipps-salg, gebyrer og bankutbetaling balanserer ikke.");
 const grossByRef=new Map();
 for(const item of captures)grossByRef.set(item.reference,
  (grossByRef.get(item.reference)||0)+item.amountOre);
 if(grossByRef.size>150)
  throw Error("Oppgjøret har for mange fakturabetalinger for trygg automatisk kontroll.");
 const confirmedIds=new Map();
 for(const p of transfers.filter(x=>x.status==="confirmed")){
  if(!p.payment_id||!int(Number(p.amount_ore)))continue;
  if(confirmedIds.has(p.payment_id))throw Error("Duplisert overføringsbekreftelse i Tripletex.");
  confirmedIds.set(p.payment_id,Number(p.amount_ore));
 }
 for(const [ref,total] of grossByRef){
  if(!int(total)||total<=0)throw Error("Ugyldig Vipps-sum.");
  const candidates=local.filter(x=>x.vipps_reference===ref&&x.reversed_at==null&&
   Number(x.amount_ore)===total);
  if(candidates.length!==1||confirmedIds.get(candidates[0].id)!==total)
   throw Error("En eller flere Vipps-betalinger er ikke bekreftet overført til Tripletex. "+
    "Overfør de manglende fakturaene før oppgjøret bokføres.");
 }
 return {payoutId,payoutDate,grossOre,feeOre,payoutOre,
  capturedCount:captures.length,paymentCount:grossByRef.size,
  sourceStartDate:group[0].date,
  referenceCount:grossByRef.size};
}
export function tripletexPayoutVoucher({plan,unit,customerId,bankAccountId,feeAccountId,
 customerAccountId}){
 const ids=[customerId,bankAccountId,feeAccountId,customerAccountId];
 if(!plan||ids.some(x=>!Number.isSafeInteger(x)||x<=0)||
  new Set(ids.slice(1)).size!==3||!dateOk(plan.payoutDate)||
  !int(plan.grossOre)||!int(plan.feeOre)||!int(plan.payoutOre)||
  plan.grossOre!==plan.feeOre+plan.payoutOre||plan.payoutOre<=0)
  throw Error("Ugyldig oppgjørsbilag. Ingenting er opprettet.");
 const marker=payoutTripletexMarker(unit,plan.payoutId);
 const amount=ore=>Number((ore/100).toFixed(2));
 const posting=(row,accountId,ore,extra={})=>({
  row,date:plan.payoutDate,amountGross:amount(ore),
  amountGrossCurrency:amount(ore),account:{id:accountId},
  vatType:{id:0},...extra
 });
 const postings=[
  posting(1,bankAccountId,plan.payoutOre),
  ...(plan.feeOre>0?[posting(2,feeAccountId,plan.feeOre)]:[]),
  posting(3,customerAccountId,-plan.grossOre,{customer:{id:customerId}})
 ];
 if(Math.round(postings.reduce((sum,p)=>sum+p.amountGross,0)*100)!==0)
  throw Error("Tripletex-bilaget balanserer ikke.");
 return {date:plan.payoutDate,
  description:"Vipps oppgjør "+marker,
  postings};
}
