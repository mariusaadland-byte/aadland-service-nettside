// S-09: Explain what the saved Vipps Service ledger actually proves.
// This is a snapshot classification, NOT external bank or Tripletex voucher verification.
const integer=x=>typeof x==="number"&&Number.isSafeInteger(x);
const completeAmount=rows=>rows.reduce((total,row)=>total+row.amountOre,0);
const validRow=row=>row&&typeof row.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)
 &&typeof row.pspReference==="string"&&row.pspReference.trim()!==""
 &&integer(row.amountOre)&&row.amountOre>0;
const isConfirmed=row=>row.tripletexStatus==="confirmed"&&!row.transferMismatch;
export function vippsServiceSettlementReview({unit,cacheInfo,report}){
 if(unit!=="service")return null; // Aadland Utleie is explicitly out of scope
 if(!report||!cacheInfo||!Number.isInteger(cacheInfo.storedDays)||
    !Array.isArray(report.feeRows)||!Array.isArray(report.payoutRows)||
    !report.totals||!integer(report.totals.capturesOre)||
    !integer(report.totals.retainedFeesOre))
  return {status:"missing",title:"Ingen fullstendig Vipps-kontroll tilgjengelig",
   message:"Hent lagrede rapporter for valgt periode før noen konklusjon trekkes."};
 const fees=report.feeRows,payouts=report.payoutRows;
 const validRows=[...fees,...payouts].every(validRow);
 const feesConfirmed=fees.filter(isConfirmed).length;
 const payoutsConfirmed=payouts.filter(isConfirmed).length;
 const pendingFees=fees.length-feesConfirmed;
 const pendingPayouts=payouts.length-payoutsConfirmed;
 const feeAmountMatches=validRows&&
  fees.every(x=>x.kind==="trukket")&&
  completeAmount(fees)===-report.totals.retainedFeesOre;
 const payoutAmountMatches=validRows&&
  completeAmount(payouts)===report.totals.payoutScheduledOre;
 const snapshotsComplete=cacheInfo.complete===true&&
  integer(cacheInfo.totalDays)&&cacheInfo.totalDays>0&&
  cacheInfo.storedDays===cacheInfo.totalDays;
 const unknown=Number(report.unknownEntryTypes||0);
 const summary={
  periodFrom:cacheInfo.from||report.from||null,
  periodTo:cacheInfo.to||report.to||null,
  storedDays:cacheInfo.storedDays,
  totalDays:cacheInfo.totalDays??null,
  lastCheckedAt:cacheInfo.lastCheckedAt||null,
  lastActivityDate:report.lastVippsBalanceDate||null,
  lastVippsBalanceOre:integer(report.lastVippsBalanceOre)?report.lastVippsBalanceOre:null,
  feeCount:fees.length,feesConfirmed,pendingFees,
  payoutCount:payouts.length,payoutsConfirmed,pendingPayouts,
  capturesOre:report.totals.capturesOre,
  retainedFeesOre:report.totals.retainedFeesOre,
  payoutScheduledOre:report.totals.payoutScheduledOre,
  // Net of observed entries, NOT a bank payment or proof of complete balance.
  netObservedOre:report.totals.capturesOre+report.totals.retainedFeesOre,
  complete:snapshotsComplete
 };
 const insufficient=(!snapshotsComplete||cacheInfo.storedDays===0);
 const invalid=!validRows||!feeAmountMatches||!payoutAmountMatches||
  !Number.isInteger(unknown)||unknown>0||
  ((fees.length>0||report.totals.capturesOre!==0)&&
   !integer(report.lastVippsBalanceOre));
 if(insufficient)return {...summary,status:"incomplete",
  title:"Vipps-perioden er ikke komplett kontrollert",
  message:"Ingen konklusjon om manglende bankutbetaling kan trekkes før rapportene for alle valgte dager er hentet."};
 if(invalid)return {...summary,status:"review",
  title:"Vipps-rapporten må gjennomgås manuelt",
  message:"En gebyrpost, utbetalingssum eller Vipps-posttype stemmer ikke med kontrollgrunnlaget. Ikke opprett et nytt bilag."};
 if(payouts.length&&pendingPayouts===0)return {...summary,status:"payout_recorded",
  title:"Vipps-oppgjør registrert i lokal Tripletex-logg",
  message:"Oppgjøret er bekreftet i Aadland Services overføringslogg, men dette er ikke bevis for faktisk innbetaling og bankavstemming. Kontroller bankposteringen i Tripletex."};
 if(payouts.length)return {...summary,status:"payout_review",
  title:"Planlagt Vipps-utbetaling – kontroller banken før bokføring",
  message:"En planlagt Vipps-utbetaling er ikke bekreftet innbetalt i banken. Bruk bankmatch og kontroll mot Tripletex før noe nytt bilag opprettes."};
 if(pendingFees)return {...summary,status:"fee_review",
  title:"Vipps-gebyr mangler bekreftet lokal Tripletex-overføring",
  message:"Kontroller gebyrene og eventuelle tidligere bokføringer før ny overføring. Ikke før dem dobbelt."};
 if(fees.length===0&&report.totals.capturesOre===0&&report.totals.refundsOre===0)
  return {...summary,status:"no_activity",
   title:"Ingen Vipps-utbetalinger eller gebyrer i valgt periode",
   message:"Rapportene inneholder ingen planlagte bankutbetalinger. Det er derfor heller ingen slik utbetaling å bokføre fra dette grunnlaget."};
 return {...summary,status:"no_payout",
  title:"Ingen planlagt Vipps-bankutbetaling i lagret periode",
  message:"Alle trukne gebyrer har bekreftet status i Aadland Services lokale Tripletex-logg. Det finnes ingen Vipps-post av typen «payout-scheduled». Null bankutbetalingsbilag er derfor ikke i seg selv et avvik. Kontroller separat at gebyrbilagene finnes i Tripletex; oppgjørssaldo er ikke bankinnskudd."};
}
