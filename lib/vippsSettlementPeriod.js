// Pure date splitting and display aggregation for Vipps settlement preflights.
// The backend intentionally limits each individual Vipps Report API request to
// seven days. The browser can combine at most 366 days, but ONLY when every chunk succeeds.
const DAY_MS=86400000;
const KEYS=["capturesOre","refundsOre","retainedFeesOre","feesChargedOre",
 "payoutScheduledOre","payoutAbortedOre","numberOfCaptures","numberOfRefunds",
 "numberOfFees","numberOfPayouts"];
function dateNumber(value){
 if(typeof value!=="string"||!/^20\d\d-\d\d-\d\d$/.test(value))return null;
 const d=Date.parse(value+"T00:00:00Z");
 return Number.isFinite(d)&&new Date(d).toISOString().slice(0,10)===value?d:null;
}
function asDate(value){return new Date(value).toISOString().slice(0,10)}
export function vippsPeriodBatches(from,to,{limitDays=366,batchDays=7}={}){
 const start=dateNumber(from),end=dateNumber(to);
 if(start===null||end===null||start>end||!Number.isInteger(limitDays)||
  limitDays<1||limitDays>366||!Number.isInteger(batchDays)||batchDays<1||batchDays>7)
  return null;
 const count=Math.round((end-start)/DAY_MS)+1;
 if(count>limitDays)return null;
 const batches=[];
 for(let i=0;i<count;i+=batchDays){
  batches.push({
   from:asDate(start+i*DAY_MS),
   to:asDate(start+(Math.min(i+batchDays,count)-1)*DAY_MS)
  });
 }
 return batches;
}
export function combineVippsPeriodResponses(parts,expectedBatches,unit){
 if(!Array.isArray(parts)||!Array.isArray(expectedBatches)||
  !parts.length||parts.length!==expectedBatches.length)
  throw Error("Ufullstendige Vipps-rapporter. Ingen samlet avstemming kan vises.");
 const totals=Object.fromEntries(KEYS.map(key=>[key,0]));
 const payoutRows=[],feeRows=[],byReference=new Map();
 let unreferencedCaptures=0,unknownEntryTypes=0,matchingLimited=false;
 let lastVippsBalanceOre=null,lastVippsBalanceDate=null;
 let tripletexConnected=true;
 for(let i=0;i<parts.length;i++){
  const part=parts[i],expected=expectedBatches[i];
  if(part?.ok!==true||part.unit!==unit||part.from!==expected.from||
   part.to!==expected.to||part.ledgerMatched!==true||
   !part.totals||!Array.isArray(part.payoutRows)||!Array.isArray(part.matching))
   throw Error("Vipps svarte med en ufullstendig eller feil periode. Ingenting er bokført.");
  for(const key of KEYS){
   const n=part.totals[key];
   if(!Number.isSafeInteger(n)||!Number.isSafeInteger(totals[key]+n))
    throw Error("Ugyldig summering i Vipps-oppgjøret.");
   totals[key]+=n;
  }
  const unref=part.unreferencedCaptures,unknown=part.unknownEntryTypes;
  if(!Number.isSafeInteger(unref)||unref<0||
   !Number.isSafeInteger(unknown)||unknown<0)
   throw Error("Ugyldig kontrollinformasjon fra Vipps.");
  unreferencedCaptures+=unref;
  unknownEntryTypes+=unknown;
  if(part.matchingLimited===true)matchingLimited=true;
  if(part.tripletexConnected!==true)tripletexConnected=false;
  if(part.lastVippsBalanceDate&&Number.isSafeInteger(part.lastVippsBalanceOre)&&
   (!lastVippsBalanceDate||part.lastVippsBalanceDate>=lastVippsBalanceDate)){
   lastVippsBalanceOre=part.lastVippsBalanceOre;
   lastVippsBalanceDate=part.lastVippsBalanceDate;
  }
  for(const row of part.payoutRows){
   if(typeof row?.date!=="string"||!Number.isSafeInteger(row.amountOre))
    throw Error("Ugyldig utbetalingspost i Vipps.");
   payoutRows.push(row);
  }
  if(part.feeRows!==undefined&&!Array.isArray(part.feeRows))
   throw Error("Ugyldig gebyrgrunnlag fra Vipps.");
  for(const row of part.feeRows||[]){
   if(typeof row?.date!=="string"||!Number.isSafeInteger(row.amountOre)||
    typeof row.pspReference!=="string")
    throw Error("Ugyldig gebyrpost i Vipps.");
   feeRows.push(row);
  }
  for(const row of part.matching){
   if(typeof row?.reference!=="string"||!row.reference||
    !Number.isSafeInteger(row.capturedOre)||
    !["tripletex-bekreftet","funnet-i-aadland","ingen-sikker-kobling",
      "flere-mulige-betalinger"].includes(row.status))
    throw Error("Ugyldig referanse fra Vipps.");
   const old=byReference.get(row.reference);
   if(old){
    const newAmount=old.capturedOre+row.capturedOre;
    if(!Number.isSafeInteger(newAmount))
     throw Error("Ugyldig samlet beløp på Vipps-referansen.");
    // A reference spanning two settlement dates must be reviewed across the
    // complete period: individual daily matches do not prove a correct match.
    byReference.set(row.reference,{
     reference:row.reference,capturedOre:newAmount,
     count:old.count+row.count,status:"ingen-sikker-kobling"
    });
   }else{
    byReference.set(row.reference,{...row});
   }
  }
 }
 return {
  ok:true,unit,from:expectedBatches[0].from,
  to:expectedBatches[expectedBatches.length-1].to,
  totals,payoutRows,feeRows,lastVippsBalanceOre,lastVippsBalanceDate,
  matching:[...byReference.values()].sort((a,b)=>
   a.reference.localeCompare(b.reference,"nb")),
  unreferencedCaptures,unknownEntryTypes,tripletexConnected,matchingLimited,
  postingEnabled:false,
  warning:"Dette viser Vipps-rapporter, ikke bekreftede bankinnskudd. Gebyrer, refusjoner og åpne poster må avstemmes mot Tripletex.",
  status:"Alle delrapporter hentet. Ingen regnskapsbilag er opprettet."
 };
}
