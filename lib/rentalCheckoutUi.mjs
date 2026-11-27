// Browser-safe checkout binding and response validation. Server remains authoritative.
const uuid=v=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const hex=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const ore=v=>Number.isSafeInteger(v)&&v>=0&&v<=2147483647;
export function checkoutRequest({quote,lines,sales,accepted,requestId}){
 if(!accepted||!uuid(requestId)||!hex(quote?.digest)||quote?.snapshot?.termsVersion!=="2026-11-25"||!Array.isArray(lines)||!lines.length||!Array.isArray(sales))return null;
 return {requestId,quoteDigest:quote.digest,acceptedTerms:true,termsVersion:quote.snapshot.termsVersion,lines:lines.map(({itemId,startDate,endDate,quantity})=>({itemId,startDate,endDate,quantity})),consumables:sales.map(({id,quantity})=>({id,quantity}))};
}
export function checkoutAgreementResponse(body,request){
 if(body?.status!=="agreement_ready"||!uuid(body.groupId)||!uuid(body.agreementId)||!hex(body.documentDigest)||body.quoteDigest!==request?.quoteDigest||body.termsVersion!==request.termsVersion||!Number.isFinite(Date.parse(body.expiresAt))||!ore(body.payableOre)||!ore(body.depositOre)||typeof body.orderNumber!=="string")return null;
 return {groupId:body.groupId,agreementId:body.agreementId,documentDigest:body.documentDigest,quoteDigest:body.quoteDigest,termsVersion:body.termsVersion,expiresAt:body.expiresAt,payableOre:body.payableOre,depositOre:body.depositOre,orderNumber:body.orderNumber,documentUrl:"/api/customer/signing/"+body.agreementId+"/avtale"};
}
export function checkoutConsent(agreement,name,accepted){
 const clean=typeof name==="string"?name.trim():"";
 if(!agreement||!accepted||clean.length<2||clean.length>120||/[\x00-\x1f\x7f]/.test(clean))return null;
 return {agreementId:agreement.agreementId,documentDigest:agreement.documentDigest,quoteDigest:agreement.quoteDigest,termsVersion:agreement.termsVersion,name:clean,accepted:true,paymentObligation:true};
}
export const isCheckoutId=uuid;
