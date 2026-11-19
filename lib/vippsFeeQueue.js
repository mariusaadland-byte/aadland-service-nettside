// Pure UI eligibility rules only. The existing owner-only POST endpoint must
// always revalidate Vipps, Tripletex, accounting locks and unique claims.
export const MAX_VIPPS_FEE_BATCH=10;
export const feeQueueKey=row=>String(row?.date||"")+"|"+String(row?.pspReference||"");
export function vippsFeeQueue({unit,rows,complete,unknownEntryTypes=0}){
 const issues=[];
 if(unit!=="service")issues.push("Samlet gebyrføring er kun tilgjengelig for Aadland Service.");
 if(!complete)issues.push("Vipps-rapportene for valgt periode er ufullstendige.");
 if(unknownEntryTypes>0)issues.push("Ukjente Vipps-posttyper må undersøkes.");
 if(!Array.isArray(rows))return {eligible:[],issues:[...issues,"Gebyrlisten mangler."]};
 const seen=new Set(),dupes=new Set();
 for(const row of rows){
  const id=feeQueueKey(row);
  if(seen.has(id))dupes.add(id);
  seen.add(id);
 }
 const eligible=rows.filter(row=>{
  const id=feeQueueKey(row);
  return row?.kind==="trukket"&&row.tripletexStatus==="not_transferred"&&
   !row.transferMismatch&&!dupes.has(id)&&
   /^20\d\d-\d\d-\d\d$/.test(String(row.date||""))&&
   /^[A-Za-z0-9_-]{4,100}$/.test(String(row.pspReference||""))&&
   Number.isSafeInteger(row.amountOre)&&row.amountOre>0;
 }).sort((a,b)=>a.date.localeCompare(b.date)||a.pspReference.localeCompare(b.pspReference));
 if(dupes.size)issues.push("Flere like Vipps-gebyrreferanser må gjennomgås manuelt.");
 const review=rows.filter(row=>
  row?.transferMismatch||["processing","needs_review"].includes(row?.tripletexStatus)||
  row?.kind!=="trukket").length;
 if(review)issues.push(review+" gebyrer er ikke klare for samlet bokføring og må kontrolleres enkeltvis.");
 return {eligible:issues.some(x=>x.includes("ufullstendige")||
  x.includes("Ukjente")||x.includes("kun tilgjengelig"))?[]:eligible,issues,
  confirmedCount:rows.filter(x=>x.tripletexStatus==="confirmed"&&!x.transferMismatch).length};
}
export function validVippsFeePreview(row,preview){
 const account=preview?.feeAccounts?.filter(a=>a.number===7770&&
  Number.isSafeInteger(Number(a.id))&&Number(a.id)>0)||[];
 return Boolean(preview?.ok&&preview.ready===true&&!preview.previous&&
  Number(preview?.plan?.amountOre)===row?.amountOre&&
  Number(preview?.customer?.number)===10009&&
  /vipps/i.test(String(preview?.customer?.name||""))&&
  typeof preview?.digest==="string"&&/^[a-f0-9]{64}$/.test(preview.digest)&&
  account.length===1);
}
