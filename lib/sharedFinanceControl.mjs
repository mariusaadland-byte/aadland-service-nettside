const integer=n=>Number.isSafeInteger(n);
const positive=n=>integer(n)&&n>=0;
export const validFinanceYear=y=>Number.isInteger(y)&&y>=2000&&y<=2100;
const osloYear=s=>typeof s==="string"&&Number.isFinite(Date.parse(s))?Number(new Intl.DateTimeFormat("en-GB",{year:"numeric",timeZone:"Europe/Oslo"}).format(new Date(s))):null;
export function rentalYearControl(data,year){
 if(!validFinanceYear(year)||!data||!Array.isArray(data.rows)||!data.totals)return null;
 const totals={capturedOre:0,rentalOre:0,salesOre:0,capturedCount:0,invoiceConfirmed:0,paymentConfirmed:0,transferPending:0,transferReview:0};
 const seen=new Set();
 for(const r of data.rows){
  if(typeof r.id!=="string"||seen.has(r.id))return null;seen.add(r.id);
  if(r.grossOre===null){if(r.capturedAt!==null)return null;continue;}
  const y=osloYear(r.capturedAt);
  if(y===null||![r.grossOre,r.rentalOre,r.salesOre].every(positive)||r.grossOre!==r.rentalOre+r.salesOre||!["pending","invoice_confirmed","payment_confirmed","review"].includes(r.transfer))return null;
  if(y!==year)continue;
  totals.capturedOre+=r.grossOre;totals.rentalOre+=r.rentalOre;totals.salesOre+=r.salesOre;totals.capturedCount++;
  if(r.transfer==="payment_confirmed"){totals.invoiceConfirmed++;totals.paymentConfirmed++;}
  else if(r.transfer==="invoice_confirmed"){totals.invoiceConfirmed++;totals.transferPending++;}
  else if(r.transfer==="review")totals.transferReview++;
  else totals.transferPending++;
 }
 if(!Object.values(totals).every(positive)||!positive(data.totals.depositUnsettledOre)||!positive(data.totals.depositMissingOre))return null;
 return {...totals,year,depositUnsettledOre:data.totals.depositUnsettledOre,depositMissingOre:data.totals.depositMissingOre,feesOre:null,bankPayoutOre:null,costsOre:null};
}
// The legacy register includes external invoices and shared purchases. Do not
// assert they belong only to Service. Do not add capture to invoiced turnover.
export function sharedFinanceControl({year,legacy,rental}){
 if(!validFinanceYear(year))return null;
 let common=null;
 if(legacy?.year===year){
  const t=legacy.total;
  if(t&&["invoicedGrossOre","recordedPaymentsThisYearOre","outstandingOre","expenseGrossOre","externalGrossOre"].every(k=>integer(t[k]))&&["invoicedGrossOre","recordedPaymentsThisYearOre","outstandingOre","externalGrossOre"].every(k=>t[k]>=0)){
   common={invoicedOre:t.invoicedGrossOre,receivedOre:t.recordedPaymentsThisYearOre,outstandingOre:t.outstandingOre,purchaseOre:t.expenseGrossOre,externalOre:t.externalGrossOre};
  }
 }
 const r=rental?.year===year&&[rental.capturedOre,rental.rentalOre,rental.salesOre,rental.capturedCount,rental.transferPending,rental.transferReview,rental.depositUnsettledOre,rental.depositMissingOre].every(positive)&&rental.capturedOre===rental.rentalOre+rental.salesOre?rental:null;
 const raw=legacy?.costAllocation,b=raw?.buckets;const keys=["service","rental","shared","unallocated"];
 const allocation=common&&b&&keys.every(k=>integer(b[k]?.grossOre)&&positive(b[k]?.count))&&keys.reduce((n,k)=>n+b[k].grossOre,0)===common.purchaseOre&&raw.totalGrossOre===common.purchaseOre?b:null;
 return {year,common,rental:r,allocation,serviceOnlyOre:null,rentalCostsOre:allocation?.rental.grossOre??null,unallocatedPurchaseOre:allocation?.unallocated.grossOre??common?.purchaseOre??null,combinedRevenueOre:null,combinedProfitOre:null};
}
