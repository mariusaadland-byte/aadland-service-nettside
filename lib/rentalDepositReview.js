// Pure validation shared by the admin route and smoke tests.
// This is a physical return inspection, NOT a payment, refund, or Vipps capture.
export function validateRentalDepositInspection(booking,input){
 if(!booking)return {error:"Bookingen ble ikke funnet."};
 if(!["returned","completed"].includes(String(booking.status||"")))
  return {error:"Registrer utstyret som returnert før du dokumenterer returkontrollen."};
 const max=Number(booking.deposit_ore);
 if(!Number.isSafeInteger(max)||max<=0)
  return {error:"Bookingen har ikke sikkerhetsdepositum."};
 const result=String(input?.result||"");
 if(!["ok","damage"].includes(result))
  return {error:"Velg skadefri retur eller skade."};
 const estimate=Number(input?.damageEstimateOre);
 if(!Number.isSafeInteger(estimate)||estimate<0||estimate>max)
  return {error:"Skadeanslaget må være mellom 0 kr og depositumsbeløpet."};
 const note=String(input?.note??"").trim();
 if(note.length>2000)return {error:"Kontrollnotatet kan være maks 2000 tegn."};
 if(result==="damage"&&note.length<10)
  return {error:"Beskriv skaden tydelig før returkontrollen registreres (minst 10 tegn)."};
 if(result==="ok"&&estimate!==0)
  return {error:"Skadefri retur kan ikke ha et skadeanslag."};
 return {value:{result,damage_estimate_ore:estimate,note}};
}

// These are recorded amounts, never a claim of actual funds transfer.
export function rentalDepositBalance(held,charged,releasedAt){
 const h=Math.max(0,Number(held)||0),c=Math.max(0,Number(charged)||0);
 return {remainingOre:Math.max(0,h-c),invalid:c>h,closed:Boolean(releasedAt)};
}
export function sameRentalInspection(existing,bookingId,input){
 return existing?.booking_id===bookingId&&existing.result===input.result&&Number(existing.damage_estimate_ore)===Number(input.damageEstimateOre)&&existing.note===String(input.note??"").trim();
}
