// S-05: Read-only Tripletex evidence; owner review is always separate.
export const positiveTripletexVoucherId=value=>{
 if(!/^[1-9]\d{0,14}$/.test(String(value??"").trim()))return null;
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>0?n:null;
};
export function remoteTripletexVoucherSummary(payload,expectedId){
 const voucher=payload?.value;
 const id=positiveTripletexVoucherId(voucher?.id);
 if(!voucher||id!==positiveTripletexVoucherId(expectedId))
  throw Error("Tripletex returnerte ikke det etterspurte bilaget.");
 const year=Number(voucher.year),number=Number(voucher.number);
 const date=String(voucher.date||"");
 if(!Number.isInteger(year)||year<2000||year>2100||
    !Number.isSafeInteger(number)||number<=0||
    !/^20\d\d-\d\d-\d\d$/.test(date))
  throw Error("Tripletex-bilaget mangler gyldig dato eller bokføringsnummer.");
 const postings=Array.isArray(voucher.postings)?voucher.postings:[];
 const vatCodes=[...new Set(postings.map(p=>
  p?.vatType?.number??p?.vatType?.id??null).filter(v=>v!==null&&v!==undefined).map(String))];
 const accounts=[...new Set(postings.map(p=>p?.account?.number).filter(Boolean).map(String))];
 return {
  voucherId:id,year,number,date,
  isTemporary:voucher.isTemporary,
  postingCount:postings.length,
  vatCodes:vatCodes.slice(0,20),
  accounts:accounts.slice(0,20),
  canReview:voucher.isTemporary===false,
  // Do not imply that an unlinked voucher is this particular original receipt.
  reviewRequired:true
 };
}
export const purchaseReceiptGrossOre=doc=>{
 const base=Number(doc?.base_ore),vat=Number(doc?.vat_ore);
 if(!Number.isSafeInteger(base)||!Number.isSafeInteger(vat))
  throw Error("Bilagsbeløpet kunne ikke bekreftes.");
 return base+vat;
};
