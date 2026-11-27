// Review only: no external IDs, invoice numbers, accounts or posting authority.
const int=n=>Number.isSafeInteger(n);
const pos=n=>int(n)&&n>0;
export function rentalInvoiceCandidate({accounting,groupStatus,paidAt,reference,pspReference}){
 if(!accounting||!Array.isArray(accounting.lines)||!accounting.lines.length||!pos(accounting.grossOre)||accounting.lines.some(l=>!["rental","goods"].includes(l.kind)||!pos(l.quantity)||!int(l.grossOre)||l.grossOre<0||!int(l.netOre)||!int(l.vatOre)||l.netOre+l.vatOre!==l.grossOre)||accounting.lines.reduce((s,l)=>s+l.grossOre,0)!==accounting.grossOre)return null;
 const blockers=["Mva-status og utgående mva-type må bekreftes","Kunde, fakturadato og leveringsdato må kontrolleres","Kontoplan og betalingsmetode må bekreftes","Tripletex-overføringslås er ikke etablert"];
 if(!accounting.signed||!accounting.captureRecorded||!["confirmed","fulfilled"].includes(groupStatus)||!Number.isFinite(Date.parse(paidAt))||!reference||!pspReference)blockers.push("Signert og fullt registrert betaling mangler");
 if(groupStatus!=="fulfilled")blockers.push("Utlevering er ikke registrert");
 if(accounting.lines.some(l=>Math.round(l.netOre*1.25)!==l.grossOre))blockers.push("Avrunding må kontrolleres i Tripletex");
 return {reference:accounting.reference,lines:accounting.lines.map(l=>({...l,vatRate:25})),grossOre:accounting.grossOre,netOre:accounting.netOre,vatOre:accounting.vatOre,depositOre:accounting.depositExpectedOre,paidAt:paidAt||null,paymentReference:reference||null,pspReference:pspReference||null,blockers,readyToPost:false};
}
export function rentalReportReview({reference,pspReference,expectedOre,funds,fees}){
 if(typeof reference!=="string"||!/^AUG-[a-f0-9-]{36}$/.test(reference)||typeof pspReference!=="string"||!pspReference||!pos(expectedOre)||!Array.isArray(funds)||!Array.isArray(fees)||[...funds,...fees].some(x=>!int(x.amountOre)))return null;
 const relevant=x=>x.reference===reference||x.pspReference===pspReference;
 const relatedFunds=funds.filter(relevant),relatedFees=fees.filter(relevant);
 const captures=relatedFunds.filter(x=>x.type==="capture");
 const exact=captures.length===1&&captures[0].reference===reference&&captures[0].pspReference===pspReference&&captures[0].amountOre===expectedOre;
 const other=relatedFunds.filter(x=>x.type!=="capture");
 const charge=relatedFees.filter(x=>x.type==="capture-fee");
 // An order-level assessed fee is not proof of a retained fee or payout.
 const feeKnown=exact&&charge.length===1&&charge[0].reference===reference&&charge[0].pspReference===pspReference&&charge[0].amountOre>=0&&relatedFees.length===1;
 const feeOre=feeKnown?charge[0].amountOre:null;
 return {status:exact&&!other.length?"capture_matched":"review",captureOre:exact?expectedOre:null,assessedFeeOre:feeOre,afterAssessedFeeOre:feeOre!==null?expectedOre-feeOre:null,retainedFeeOre:null,bankPayoutOre:null,relatedAdjustments:other.length,readyToPost:false};
}
